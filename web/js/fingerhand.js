// F키 손동작: 1인칭 오른손이 가운데손가락을 올렸다 내린다. 연타하면 점점 빨라진다.
// 손 모델: WebXR generic hand (MIT, models/hand_right.glb). 관절이 모두 형제로 붙어 있어서
// 불러온 뒤 손가락 사슬(손목 → 손허리 → 첫마디 → 가운데마디 → 끝마디 → 끝)로 다시 이어 붙인다.
import { THREE } from './kit.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const SEG = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];

export class FingerHand {
  constructor(gltfScene) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.01, 5);
    this.hemi = new THREE.HemisphereLight(0xdfe6ff, 0x302820, 1.3); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff1e0, 1.6); this.key.position.set(0.6, 1, 1.2); this.scene.add(this.key);
    this.root = new THREE.Group(); this.scene.add(this.root);
    const model = cloneSkinned(gltfScene);
    this.root.add(model);
    model.updateMatrixWorld(true);
    const J = {};
    model.traverse((o) => { if (o.isBone || /wrist|finger|thumb/.test(o.name)) J[o.name] = o; });
    // 사슬로 다시 잇기 (세계 위치는 그대로)
    const chain = (names) => { let par = J.wrist; for (const n of names) { const b = J[n]; if (b && par) { par.attach(b); par = b; } } };
    for (const f of FINGERS) chain(SEG.map((s) => `${f}-finger-${s}`));
    chain(THUMB);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8a585 });
    model.traverse((o) => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });
    this.J = J;
    this.rest = new Map(); for (const k in J) this.rest.set(k, J[k].quaternion.clone());
    this.model = model;
    this.v = 0; this.target = 0; this.holdUntil = 0; this.taps = []; this.jab = 0; this.pump = 0; this.flick = 0;
    this.axis = new THREE.Vector3(1, 0, 0); // 굽히는 축 (관절 기준)
    this.curlSign = -1;
    this.thumbAxis = new THREE.Vector3(0, 1, 0);
    this.root.rotation.set(-0.25, -1.4, 3.05); // 손바닥이 나를 보고 손가락이 위로 (내가 앞을 향해 하는 동작)
    this._q = new THREE.Quaternion();
    this.layout(0);
  }
  /** 관절 하나를 쉬는 자세에서 a 만큼 굽힌다 */
  bend(name, a, axis = this.axis) {
    const b = this.J[name]; if (!b) return;
    b.quaternion.copy(this.rest.get(name)).multiply(this._q.setFromAxisAngle(axis, a * this.curlSign));
  }
  /** 주먹 쥐기 + 가운데손가락 펴기. ext: 가운데손가락 펴짐 (0 = 접힘, 1 = 쭉) */
  pose(ext) {
    for (const f of FINGERS) {
      const c = f === 'middle' ? 1 - ext : 1;
      this.bend(`${f}-finger-phalanx-proximal`, 1.45 * c);
      this.bend(`${f}-finger-phalanx-intermediate`, 1.6 * c);
      this.bend(`${f}-finger-phalanx-distal`, 0.9 * c);
    }
    // 엄지는 접힌 손가락 위로 감싼다
    this.bend('thumb-metacarpal', 0.35, this.thumbAxis);
    this.bend('thumb-phalanx-proximal', 0.9, this.thumbAxis);
    this.bend('thumb-phalanx-distal', 1.0, this.thumbAxis);
  }
  press(now) {
    this.taps = this.taps.filter((t) => now - t < 1.2); this.taps.push(now);
    this.target = 1; this.holdUntil = now + 0.6 + Math.min(0.6, this.taps.length * 0.05);
    this.jab = 1; this.flick = 1;
  }
  /** blocked: 메뉴·엔딩·미로·입력·위에서 보는 화면 등 */
  update(dt, now, blocked) {
    if (blocked) { this.target = 0; this.holdUntil = 0; this.taps.length = 0; }
    else if (now > this.holdUntil) this.target = 0;
    const rate = this.target > this.v ? 9 : (blocked ? 14 : 5);
    this.v += (this.target - this.v) * Math.min(1, dt * rate);
    if (this.v < 0.002 && this.target === 0) this.v = 0;
    const n = this.taps.filter((t) => now - t < 1.2).length; // 최근 1.2초 동안 누른 수
    const since = this.taps.length ? now - this.taps[this.taps.length - 1] : 99;
    this.jab = Math.max(0, this.jab - dt * 7);
    this.flick = Math.max(0, this.flick - dt * 9);
    let ext;
    if (n >= 2 && since < 0.45 && this.target > 0) {
      // 연타: 누르는 빠르기에 맞춰 접었다 폈다 (초당 3~8번). 손을 떼면 바로 멈춘다
      const hz = Math.min(8, Math.max(3, (n / 1.2) * 1.1));
      this.pump += dt * Math.PI * 2 * hz;
      ext = 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(this.pump));
    } else {
      this.pump = 0;
      ext = 1 - this.flick * 0.85; // 한 번 누름: 접었다가 튕겨 올린다
    }
    this.ext = ext;
    this.pose(ext);
    this.layout(dt, now);
  }
  layout(dt = 0, now = 0) {
    const e = 1 - this.v;
    const shove = this.jab * 0.035;
    this.root.position.set(0.11 + e * 0.05, -0.115 - e * 0.36 + shove * 0.6 + Math.sin(now * 1.7) * 0.003, -0.42 - shove);
  }
  get visible() { return this.v > 0.002; }
  /** bright: 밝은 사무실(겁쟁이 모드) 1, 어두운 사무실 0 */
  render(r, aspect, bright = 0) {
    if (!this.visible) return;
    this.hemi.intensity = 0.45 + 0.85 * bright; this.key.intensity = 0.55 + 1.05 * bright;
    if (this.cam.aspect !== aspect) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
    const ac = r.autoClear; r.autoClear = false; r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  warm(r) { const v = this.v; this.v = 1; this.layout(); r.compile(this.scene, this.cam); this.v = v; this.layout(); }
}
