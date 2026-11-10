// 한 판의 상태: 사무실, 플레이어, 이야기 진행, 깜짝 연출, 미로, 추격, 엔딩 연출.
// 처음부터 다시 = 통째로 새로 만든다 (dispose 후 new Session).
import { THREE, D, mergeStatic, disposeTree, crtMaterial } from './kit.js';
import { Vars, cond } from './story.js';
import { buildWorld, MatLib, buildMonster, buildEntity, animEntity, buildHand, poseHand, buildUncle, animUncle, NavGrid,
  buildRig, animRigWalk, animRigCreep, animRigDance, addRigEyes } from './world.js';
import { Terminal, TERM_W, TERM_H } from './terminal.js';
import { Maze, MAZES } from './maze.js';
import {
  app, settings, saves, keys, store, EYE, RADIUS, WALK, SPRINT, REACH, FOV, UNCLE_SPEED, PARK_Y,
  setPrompt, setCrosshair, setObjective, monologue, caption, help, flash, shake, countdown, jumpscare, hideJumpscare,
  setFade, fadeTo, chapterCard, showDoc, lerpAngle, t, getLang,
} from './shared.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ'), _m1 = new THREE.Matrix4(), _c0 = new THREE.Vector2(0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _aim = new THREE.Vector3();
// 이야기 노드의 run 중에서 대사를 직접 다루는 연출 (일반 대사 표시를 건너뛴다)
const SEQ_CUSTOM = new Set(['end1', 'end3', 'end4', 'end5', 'end6', 'chase']);

function setLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); }

// ---------- 감독관(CRT 머리) 관절 흔들기 ----------
function animMonster(m, dt, speed) {
  const P = m.P, moving = speed > 0.2;
  const prev = Math.sin(m.phase);
  m.phase += dt * (moving ? speed * 1.9 : 0.9);
  const ph = m.phase, s0 = Math.sin(ph);
  const swing = moving ? 0.62 : 0.05;
  for (const s of [-1, 1]) {
    const off = s > 0 ? 0 : Math.PI;
    P['thigh' + s].rotation.x = Math.sin(ph + off) * swing - (moving ? 0.1 : 0);
    P['shin' + s].rotation.x = -(moving ? Math.max(0, Math.cos(ph + off)) * 1.05 : 0.04) - 0.05;
    P['shoulder' + s].rotation.x = (moving ? 1.15 : 0.22) + Math.sin(ph * 0.5 + s) * (moving ? 0.12 : 0.04);
    P['elbow' + s].rotation.x = moving ? 0.25 + Math.sin(ph + off) * 0.12 : 0.1;
  }
  P.hips.position.y = 1.1 + (moving ? Math.abs(s0) * 0.05 : Math.sin(app.time * 1.4) * 0.01);
  P.hips.rotation.z = s0 * (moving ? 0.07 : 0.01);
  m.jitterT -= dt;
  if (m.jitterT <= 0) {
    m.jitterT = 0.07 + Math.random() * (moving ? 0.35 : 0.8);
    m.jitter = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 0.65 : 0.22);
    m.glitch = Math.random() < 0.35 ? 0.75 : 0.2;
  }
  P.head.rotation.z += (m.jitter - P.head.rotation.z) * Math.min(1, dt * 28);
  P.head.rotation.x = 0.28;
  m.glitch = Math.max(0.1, (m.glitch || 0.1) - dt * 2.5);
  m.face.uniforms.glitch.value = m.glitch;
  m.face.uniforms.time.value = app.time;
  return moving && s0 !== 0 && Math.sign(prev) !== Math.sign(s0);
}

export class Session {
  constructor(vars) {
    this.alive = true;
    this.vars = vars ? vars.clone() : new Vars();
    if (!this.vars.get('clock')) this.vars.set('clock', '00:00');
    this.timers = []; this.waiters = []; this.elapsed = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03060b);
    this.scene = scene;
    this.amb = new THREE.AmbientLight(0xffffff, 1);
    scene.add(this.amb);
    this.mats = new MatLib(app.textures, getLang());
    this.reg = buildWorld(app.layoutJson, this.mats, scene);
    this.fogBase = this.reg.fog;
    scene.fog = new THREE.FogExp2(0x03060b, this.fogBase);
    mergeStatic(this.reg.root, scene);
    // 천장(판·등기구·구멍·케이블)은 레이어 3: 평소 카메라는 보고, 위에서 내려다보는 추격 화면은 안 본다 (그림자는 그대로)
    const ceilMats = new Set(['ceiling', 'ceiling_dark'].map((k) => this.mats.cache.get(k)).filter(Boolean));
    scene.traverse((o) => { if (o.isMesh && ceilMats.has(o.material)) o.layers.set(3); });
    for (const g of this.reg.ceilingParts) g.traverse((o) => { if (o.isMesh) o.layers.set(3); });
    scene.traverse((o) => { if (o.isLight && o.shadow) o.shadow.camera.layers.enable(3); });
    // 등장하는 것들은 처음부터 만들어 바닥 아래에 둔다 → 조명·셰이더 수가 고정되어 등장 순간에 렉이 없다
    this.faceTex = this.mats.tex('screen_face', 0, false);
    // 형체: CC0 모델(감독관 = Observer, 그것 = DisturbingEyes, 겁쟁이 모드 = 휴지). 모델을 못 불러오면 예전 형체를 쓴다
    const M = app.models;
    this.monster = M.get('sup') ? buildRig(M.get('sup'), scene, { height: 2.1, emissive: 0.22, name: 'Supervisor' }) : buildMonster(this.mats, scene, this.faceTex);
    this.entity = M.get('ent') ? addRigEyes(buildRig(M.get('ent'), scene, { height: 2.05, emissive: 0.3, name: 'Entity' })) : buildEntity(this.mats, scene);
    this.uncle = M.get('tp') ? buildRig(M.get('tp'), scene, { height: 1.35, emissive: 0.08, name: 'ToiletPaper' }) : buildUncle(this.mats, scene);
    this.hand = buildHand(this.mats, scene);
    this.monLight = new THREE.PointLight(0xa8c4ff, 0, 6, 1.6);
    scene.add(this.monLight);
    this.mats.get('monster_skin').emissive?.setRGB(0.05, 0.055, 0.07);
    this.mats.get('monster_bone').emissive?.setRGB(0.04, 0.04, 0.045);
    this.buildEyeField();
    app.camera.fov = FOV; app.camera.updateProjectionMatrix();
    this.figs = new Map();
    this.parkAll();
    this.term = new Terminal(this.reg.live, this.reg.crtLight, this.reg.crtGlow, (n, v) => this.termSfx(n, v));
    this.term.setHeader(t('termTitle'), t('termIdle'), this.vars.get('clock'));
    this.term.showCenter(t('termTitle'), t('termIdle'));
    this.term.onHiddenFound = () => { this.vars.add('hidden_found', 1); };
    // 플레이어
    const sp = this.reg.spawn;
    this.p = { pos: new THREE.Vector3(sp.x, 0, -sp.z), yaw: -sp.yaw * D, pitch: 0, move: false, look: false, sprint: false, stepAcc: 0.5, bob: 0, bobY: 0, moving: false };
    this.seat = { seated: false, trans: 0, dir: 0, from: null, toPos: new THREE.Vector3(), toQuat: new THREE.Quaternion(), breathe: 0 };
    this.seatView = this.computeSeatView(this.reg.live, 0.8);
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.current = null;
    this.loops = new Map();
    this.chase = null;
    this.tension = 0;
    this.fog = { from: this.fogBase, to: this.fogBase, t: 1, dur: 1 };
    this.extBase = 1; this.flickerT = 0; this.flickT = 0; this.flickV = 1;
    this.cineLock = false; this.lookAim = null; this.fovTarget = FOV; this.monGlow = 1.2; this.pendingHint = null;
    this.scareTok = 0; this.scareBusy = false; this.rattle = null; this.shadowAcc = 0;
    this.focus = null; this.glance = null; this.lean = 0; this.leanTarget = 0;
    this.zones = []; this.storyTok = 0; this.ending = false; this.chapterId = ''; this.screenSnap = null;
    this.whisperT = 50 + Math.random() * 30; this.whisper = null;
    this.chairAnim = null; this.eyeShow = null; this.typing116 = null;
    this.topdown = null; this.stagger = 0; this.earObj = new THREE.Object3D();
    this.wp = null; // 길 안내: { id, label, at } — at(경과 시간) 이후 화면에 방향·거리 표시
    this.setupFeed();
    this.setupInteractions();
    this.startAmbient();
    this.applyChicken(settings.chicken);
    this.applyMood();
    this.buildGuide();
    this.warm();
  }

  // ---------- 처음 자리 안내: 바닥 화살표 + 117 모니터 깜빡임 (처음 앉으면 사라진다) ----------
  buildGuide() {
    this.guide = null; this.idleBlink = !this.vars.get('sat_once');
    if (!this.idleBlink) return;
    const reg = this.reg, sp = reg.spawn, sv = this.seatView;
    // 문은 지나갈 수 있는 것으로 보고 길을 찾는다 (처음엔 입구 문이 닫혀 있다). 추격용 격자와는 따로 쓴다
    const doors = reg.grid.doors; reg.grid.doors = [];
    let nav; try { nav = new NavGrid(reg.grid, 0.25, 0.3); } finally { reg.grid.doors = doors; }
    const tz = sv.pos.clone().addScaledVector(sv.n.clone().setY(0).normalize(), 0.35); // 의자 바로 뒤 바닥
    const path = nav.path(sp.x, sp.z, tz.x, -tz.z);
    if (!path || path.length < 2) return;
    // 경로를 따라 약 1.1m 간격으로 점 고르기 (배치 좌표 → three: z 반대)
    const pts = [new THREE.Vector3(sp.x, 0, -sp.z), ...path.map(([x, z]) => new THREE.Vector3(x, 0, -z))];
    const marks = []; let acc = 0.6;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = a.distanceTo(b);
      while (acc <= len) { const q = a.clone().lerp(b, acc / len); marks.push({ q, dir: Math.atan2(b.x - a.x, b.z - a.z) }); acc += 1.1; }
      acc -= len;
    }
    if (marks.length > 1) marks.pop(); // 의자 밑에는 두지 않는다
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#7ff5d8'; g.beginPath(); g.moveTo(64, 10); g.lineTo(116, 70); g.lineTo(84, 70); g.lineTo(84, 118); g.lineTo(44, 118); g.lineTo(44, 70); g.lineTo(12, 70); g.closePath(); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; this.mats.made.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(0.42, 0.42);
    const grp = new THREE.Group(); grp.name = 'GuideArrows'; grp.userData.dynamic = true;
    const items = marks.map((m, i) => {
      const mesh = new THREE.Mesh(geo, mat.clone()); // 화살표마다 밝기가 달라야 해서 재질만 복제 (셰이더는 같다)
      // 바닥에 눕히고(x) 진행 방향으로 돌린다(y). 텍스처의 화살표 끝 = 평면의 +y = 눕히면 -z
      mesh.position.set(m.q.x, 0.012, m.q.z); mesh.rotation.set(-Math.PI / 2, m.dir + Math.PI, 0, 'YXZ');
      grp.add(mesh); return { mesh, i };
    });
    this.scene.add(grp);
    this.guide = { grp, items, fade: 1, n: items.length };
  }
  updateGuide(dt) {
    const gd = this.guide;
    if (gd) {
      if (this.vars.get('sat_once')) gd.fade = Math.max(0, gd.fade - dt * 2);
      if (gd.fade <= 0) { gd.grp.visible = false; this.guide = null; }
      else for (const { mesh, i } of gd.items) { const w = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2 - i * 0.7); mesh.material.opacity = (0.22 + 0.4 * w) * gd.fade; }
    }
    // 117 모니터: 대기 화면이면 큰 글씨가 '▶ 117 · 여기 ◀' 와 번갈아 깜빡인다
    if (this.idleBlink) {
      const c = this.term.center, idle = t('termIdle');
      if (this.vars.get('sat_once') || !c || c[1] !== idle) { this.idleBlink = false; if (c && c[1] === idle) this.term.showCenter(t('termTitle'), idle); }
      else {
        const on = Math.floor(this.elapsed / 0.8) % 2 === 1, want = on ? t('wpHere') : t('termTitle');
        if (c[0] !== want) this.term.showCenter(want, idle);
      }
    }
  }

  dispose() {
    this.alive = false;
    this.scareTok++; this.storyTok++;
    app.audio.stopAllLoops();
    disposeTree(this.scene);
    for (const m of this.mats.cache.values()) m.dispose();
    for (const tx of this.mats.made) tx.dispose();
    this.feed?.rt.dispose();
    this.term.tex.dispose();
    this.typing116?.tex.dispose();
  }

  /** 첫 화면 전에 셰이더를 모두 만들어 둔다 (처음 보는 물체가 나올 때의 멈칫 방지) */
  warm() {
    const r = app.renderer;
    // 숨겨 둔 것들도 한 번은 보이게 해서 준비
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      // 실제로 그리는 대상(화면용 렌더 타깃)과 같은 조건으로 만들어야 그대로 다시 쓰인다
      r.setRenderTarget(app.rt);
      r.compile(this.scene, app.camera);
      if (this.feed) r.compile(this.scene, this.feed.cam); // 아바타(레이어 1)·CCTV 전용 형체(레이어 2)까지
      r.setRenderTarget(null);
      if (this.feed) { r.setRenderTarget(this.feed.rt); r.render(this.scene, this.feed.cam); r.setRenderTarget(null); }
    } catch (e) { console.warn('셰이더 준비 실패', e); r.setRenderTarget(null); }
    for (const o of hidden) o.visible = false;
    r.shadowMap.needsUpdate = true;
  }

  // ---------- 겁쟁이 모드 ----------
  applyChicken(on) {
    const was = this.chicken;
    this.chicken = !!on;
    for (const l of this.reg.ceiling) { l.minLevel = on ? 1 : 0; l.calm = !!on; l.apply(); }
    if (on) this.amb.color.setRGB(0.3, 0.31, 0.34); else this.amb.color.setRGB(0.05, 0.06, 0.085);
    this.fog.t = 1;
    this.scene.fog.density = on ? 0.02 : this.fogBase;
    app.audio.setChicken(on);
    // 이미 나와 있는 형체를 바꿔 세운다
    if (was !== undefined && was !== this.chicken) for (const f of [...this.figs.values()]) { const { kind, pos, yaw, layer } = f; this.hideFig(kind); this.showFig(kind, pos, yaw, { layer }); }
  }

  termSfx(name, vol) {
    const s = this.reg.live; if (!s) return;
    s.getWorldPosition(_v1);
    app.audio.playAt(name, _v1, vol, 9, 0.05);
  }

  sleep(s) { return new Promise((r) => this.timers.push({ t: s, r })); }
  until(pred) { return new Promise((r) => this.waiters.push({ pred, r })); }
  waitSeated() { return this.until(() => this.seat.seated || !this.alive); }
  standing() { return !this.seat.seated && !this.seat.dir && !this.focus; }

  computeSeatView(screen, fill) {
    screen.updateWorldMatrix(true, false);
    const sp = new THREE.Vector3(); screen.getWorldPosition(sp);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    const dist = (0.27 / fill) / (2 * Math.tan((62 * D) / 2));
    const pos = sp.clone().addScaledVector(n, dist);
    const m = new THREE.Matrix4().lookAt(pos, sp, UP);
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), sp, n };
  }

  headPose(outPos, outQuat) {
    const p = this.p;
    outPos.set(p.pos.x, EYE + p.bobY, p.pos.z);
    _e1.set(p.pitch, p.yaw, 0, 'YXZ');
    outQuat.setFromEuler(_e1);
  }

  // ---------- 착석 ----------
  sit() {
    if (this.seat.seated || this.seat.dir) return;
    this.p.move = this.p.look = false;
    this.seat.from = { pos: app.camera.position.clone(), quat: app.camera.quaternion.clone() };
    this.seat.dir = 1; this.seat.trans = 0;
    this.reg.avatar.userData.isSeated = true;
    setPrompt(null); setCrosshair(false);
    this.term.cursor.x = TERM_W / 2; this.term.cursor.y = TERM_H * 0.62;
  }
  stand(instant = false) {
    if (!this.seat.seated && this.seat.dir !== 1) return;
    if (this.term.maze || this.term.input) return; // 미로·입력 중에는 일어나지 않는다
    this.seat.seated = false; this.term.acceptInput = false; this.term.pointer(null);
    this.glance = null; this.leanTarget = 0;
    if (instant) { this.seat.dir = 0; this.finishStand(); return; }
    this.seat.from = { pos: app.camera.position.clone(), quat: app.camera.quaternion.clone() };
    this.seat.dir = -1; this.seat.trans = 0;
  }
  finishStand() {
    this.reg.avatar.userData.isSeated = false;
    if (app.phase === 'play' && !this.cineLock) { this.p.move = this.p.look = true; setCrosshair(true); }
  }

  // ---------- 상호작용 ----------
  setupInteractions() {
    const reg = this.reg, story = app.story, v = this.vars;
    const key = (id) => (id.startsWith('Window') ? 'window' : id === 'crt_Desk116' ? id : id.startsWith('crt_') ? 'dead_pc' : /^[AB]\d\d$/.test(id) ? 'desk' : id);
    for (const [id, it] of reg.its) {
      if (reg.doors.has(id) || id === 'Computer' || id === 'PowerStrip') continue;
      const k = key(id);
      if (!story.inspects.has(k)) continue;
      it.add(t('pExamine'), () => true, () => this.inspect(k), 0, this);
    }
    reg.its.get('Computer')?.add(t('pUse'), () => app.phase === 'play' && !this.seat.seated && !this.seat.dir && !this.ending, () => this.sit(), 0, this);
    for (const [id, door] of reg.doors) {
      const it = reg.its.get(id); if (!it) continue;
      it.add(t('pTryDoor'), () => door.locked, () => { app.audio.playAt('sfx_door_locked', this.anchorPos(id), 0.6, 10); this.inspect(id + '_locked'); }, 1, this);
      it.add(t('pOpen'), () => !door.locked && door.amount < 0.5 && !door.busy && id !== 'ExitDoor', () => {
        door.setOpen(1, 1.3); app.audio.playAt('sfx_door_open', this.anchorPos(id), 0.7, 14);
      }, 2, this);
      it.add(t('pClose'), () => !door.locked && door.amount >= 0.5 && !door.busy && !this.chase && id !== 'StaffDoor' && id !== 'ExitDoor', () => {
        door.setOpen(0, 1.1); app.audio.playAt('sfx_door_close', this.anchorPos(id), 0.7, 14);
      }, 2, this);
    }
    // 책상 밑 멀티탭: 한 번은 가이드가 말리고, 두 번째에 뽑힌다 → 엔딩 4
    reg.its.get('PowerStrip')?.add(t('pUnplug'), () => app.phase === 'play' && !this.ending, () => {
      if (!v.truthy('ps_warned')) {
        v.set('ps_warned', '1');
        monologue([t('spGuide') + t('guideStop1'), t('psLook')]);
        return;
      }
      this.jump('end4_seq');
    }, 0, this);
    // 회의실 유리 앞을 처음 지날 때 (유리에 비친 실루엣)
    if (!v.truthy('seen_glass')) this.zones.push({ rect: [6.0, -4.0, 12.0, -1.6], once: true, fn: () => { v.set('seen_glass', '1'); this.scare({ kind: 'glassFigure' }); } });
  }

  inspect(id) {
    const r = app.story.inspect(id, this.vars);
    for (const op of r.set) this.vars.apply(op);
    if (r.lines.length) monologue(r.lines);
  }
  anchorPos(id) { const a = this.reg.anchors.get(id); const v = new THREE.Vector3(); if (a) a.getWorldPosition(v); else v.copy(this.p.pos).setY(1.2); return v; }
  anchorObj(at) { if (!at || at === 'player') return this.playerObj || (this.playerObj = new THREE.Object3D()); return this.reg.anchors.get(at) || this.anchorObj('player'); }
  resolvePos(at) {
    const p = this.p, fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    if (at === 'player') return p.pos.clone().setY(1.2);
    if (at === 'behind') return p.pos.clone().addScaledVector(fwd, -1.2).setY(1.3);
    if (at === 'above') return p.pos.clone().setY(2.4);
    return this.anchorPos(at);
  }

  startAmbient() {
    const A = app.audio, reg = this.reg;
    const pc = reg.anchors.get('PlayerDesk');
    if (pc) this.loops.set('fan', A.loop3D('amb_fan', pc, 0.3, 0.5, 7));
    if (reg.live) this.loops.set('crt', A.loop3D('amb_crt', reg.live, 0.16, 0.3, 4));
    const srv = reg.anchors.get('Room_server');
    if (srv) this.loops.set('server', A.loop3D('amb_fan', srv, 0.4, 1, 9));
  }

  // ---------- 사무실 분위기 (구하지 못한 사람 수에 따라 어두워진다) ----------
  applyMood() {
    const v = this.vars, k = v.num('victims') >= 1 ? 0.62 : 1;
    for (const l of this.reg.ceiling) if (['zoneA', 'zoneB', 'aisle'].includes(l.group)) l.mood = k;
    this.fogBase = this.reg.fog + (v.num('victims') >= 1 ? 0.014 : 0);
    if (!this.chicken) this.fog = { from: this.scene.fog.density, to: this.fogBase, t: 0, dur: 2.5 };
    this.term.setGuideStyle({ cold: v.truthy('guide_cold'), green: v.num('annoy') >= 2 });
  }

  // ---------- 이벤트 (story.json events) ----------
  fire(id) {
    const actions = app.story.events.get(id);
    if (!actions) { console.warn('정의되지 않은 이벤트', id); return; }
    this.runEvent(id, actions).catch((e) => console.error('이벤트 오류', id, e));
  }
  async runEvent(id, actions) {
    for (const a of actions) {
      if (!this.alive) return;
      if (a.if && !cond(a.if, this.vars)) continue;
      if (a.do === 'wait') { await this.sleep(a.s ?? 1); continue; }
      if (a.do === 'monitors') { await this.monitors(a); continue; }
      if (a.do === 'scare') { this.scare(a); continue; }
      try { this.act(a); } catch (e) { console.error('동작 오류', id, a.do, e); }
    }
  }
  act(a) {
    const reg = this.reg, v = this.vars, A = app.audio, tg = a.target || '';
    switch (a.do) {
      case 'set': v.apply(a.value || ''); break;
      case 'door': { const d = reg.doors.get(tg); if (!d) break; if ('locked' in a) d.setLocked(!!a.locked); if ('open' in a) d.setOpen(a.open, a.time ?? 1.5); break; }
      case 'light': for (const l of this.lights(tg)) l.fadeTo(a.level ?? 1, a.time ?? 1); break;
      case 'flicker': for (const l of this.lights(tg)) l.flicker = a.on ?? true; break;
      case 'sound': {
        if (a.loop) { const lp = A.loop3D(a.clip, this.anchorObj(a.at), a.volume ?? 0.8, 1, a.range ?? 14); this.loops.set(a.id || a.clip, lp); }
        else A.playAt(a.clip, this.resolvePos(a.at || 'player'), a.volume ?? 0.8, a.range ?? 20, 0.03);
        break;
      }
      case 'stopsound': A.fadeLoop(this.loops.get(a.id), 0.6); this.loops.delete(a.id); break;
      case 'cctv': this.cctv(a); break;
      case 'terminal': if ('power' in a) this.term.setPower(a.power, a.time ?? 0.6); if ('glitch' in a) this.term.glitchFx(a.glitch, a.time ?? 0.5); break;
      case 'glitch': this.term.glitchFx(a.amount ?? 0.6, a.time ?? 0.4); flash((a.flash ?? 0) * (this.chicken ? 0.4 : 1)); break;
      case 'phone':
        if (a.ring ?? true) { A.fadeLoop(this.loops.get('phone'), 0.1); this.loops.set('phone', A.loop3D('sfx_phone', reg.anchors.get('Phone'), 0.65, 1, 22)); }
        else { A.fadeLoop(this.loops.get('phone'), 0.2); this.loops.delete('phone'); }
        break;
      case 'checkpoint': this.checkpoint(a); break;
      case 'hint': if (this.cineLock) this.pendingHint = v.format(a.text || ''); else setObjective(v.format(a.text || '')); break;
      case 'caption': caption(v.format(a.text || '')); break;
      case 'monologue': if (a.inspect) this.inspect(a.inspect); else monologue([v.format(a.text || '')]); break;
      case 'tension': { const lv = a.level | 0; A.setTension(lv); this.term.tension = lv; this.tension = lv; v.set('tension', lv); break; }
      case 'music': A.setMusic(a.track || 'game'); break;
      case 'standup': this.stand(false); break;
      case 'mood': this.applyMood(); break;
      case 'print': this.print(a); break;
      case 'projector': this.projector(!!a.on); break;
      default: console.warn('알 수 없는 동작', a.do);
    }
  }
  lights(group) { if (group === 'all') return this.reg.ceiling; return this.reg.lights.get(group) || []; }

  // ---------- CCTV ----------
  setupFeed() {
    const rt = new THREE.WebGLRenderTarget(320, 240);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(80, 4 / 3, 0.1, 40);
    cam.layers.enable(1); cam.layers.enable(2); cam.layers.enable(3);
    this.feed = { rt, cam, t: 0, on: false, toTerm: false, camId: null };
    this.setFeedCam('CAM1');
  }
  setFeedCam(id) {
    const c = this.reg.cctvs.get(id); if (!c || !this.feed) return;
    const cam = this.feed.cam;
    c.head.add(cam); cam.position.set(0, 0, 0.15); cam.rotation.set(0, Math.PI, 0);
    this.feed.camId = id;
    for (const cc of this.reg.cctvs.values()) cc.led.material = cc === c ? cc.ledOn : cc.ledOff;
  }
  cctv(a) {
    if (a.target) this.setFeedCam(a.target);
    if (a.feed && this.feed) {
      this.feed.on = true;
      this.reg.cctvMonitor?.turnOn(this.feed.rt.texture, [0.75, 0.95, 0.85], 1.6, 0.5);
    }
  }

  async monitors(a) {
    const list = [...this.reg.dead];
    const pp = this.p.pos;
    const wp = (m) => { const v = new THREE.Vector3(); m.mesh.getWorldPosition(v); return v; };
    list.sort((x, y) => wp(x).distanceToSquared(pp) - wp(y).distanceToSquared(pp));
    const tex = this.mats.tex('screen_117', 0, false);
    for (const m of list) {
      if (!this.alive) return;
      if (a.mode === 'off') m.turnOff(0.3);
      else { m.turnOn(tex, [0.75, 0.9, 1.0], 1.2, 0.35); app.audio.playAt('sfx_crt_on', wp(m).add(new THREE.Vector3(0, 0.2, 0)), 0.3, 14, 0.08); }
      await this.sleep(a.interval ?? 0.6);
    }
  }

  /** 확인 지점: 물건을 조사하거나(target) 구역에 들어가면(zone) flag 를 세우고 then 이벤트 */
  checkpoint(a) {
    const v = this.vars, flag = a.flag || '';
    if (flag && v.truthy(flag)) return;
    const done = () => {
      if (flag && v.truthy(flag)) return false;
      if (flag) v.set(flag, '1');
      if (a.inspect) this.inspect(a.inspect);
      if (a.then) this.fire(a.then);
      return true;
    };
    if (a.zone) { this.zones.push({ rect: a.zone, once: true, fn: done }); return; }
    const it = this.reg.its.get(a.target || '');
    if (!it) { console.warn('확인 지점 대상 없음', a.target); done(); return; }
    if (flag) this.setWaypoint(a.target, t('wp_' + a.target), 25);
    const owner = {};
    it.add(a.prompt || t('pCheck'), () => !v.truthy(flag), () => {
      if (!done()) return;
      it.removeOwner(owner);
      app.audio.play2D('sfx_check', 0.25);
      if (a.target === 'CctvMonitor') this.focusOn(this.reg.cctvMonitor.mesh, 0.6, 8.5);
    }, 100, owner);
  }

  /** 프린터가 혼자 출력한다. 출력물을 집으면 flag */
  print(a) {
    const pr = this.reg.printer; if (!pr) return;
    const v = this.vars, sheet = app.story.sheets[a.sheet] || [];
    pr.t = 0; pr.led.material = pr.ledOn; pr.pile.visible = false;
    app.audio.playAt('sfx_printer', this.anchorPos('Printer'), 0.9, 22);
    const it = this.reg.its.get('Printer'), owner = {};
    if (a.flag) this.setWaypoint('Printer', t('wp_Printer'), 25);
    it?.add(t('pTakePrint'), () => pr.t >= 2.6, async () => {
      it.removeOwner(owner);
      pr.pile.visible = false; pr.sheet.position.z = -pr.closedZ; pr.t = -1;
      app.audio.play2D('sfx_check', 0.3);
      this.p.move = this.p.look = false;
      if (document.pointerLockElement) document.exitPointerLock();
      await showDoc(sheet.map((l) => v.format(l)));
      if (a.flag) v.set(a.flag, '1');
      if (app.phase === 'play' && !this.cineLock) { this.p.move = this.p.look = true; }
      app.flow.relock?.();
    }, 100, owner);
  }

  projector(on) {
    const pj = this.reg.projector; if (!pj) return;
    pj.on = on;
    if (pj.screen) pj.screen.visible = on;
    if (pj.beam) pj.beam.visible = on;
    pj.led.material = this.mats.get(on ? 'led_blue' : 'plastic_dark');
    if (on) { if (!this.loops.get('proj')) this.loops.set('proj', app.audio.loop3D('amb_fan', pj.root, 0.25, 0.5, 6)); }
    else { app.audio.fadeLoop(this.loops.get('proj'), 0.4); this.loops.delete('proj'); }
    app.renderer.shadowMap.needsUpdate = true;
  }

  // ---------- 형체 (감독관·그것·아저씨) ----------
  figObj(kind) { return this.chicken ? this.uncle : kind === 'sup' ? this.monster : this.entity; }
  showFig(kind, pos, yaw, opts = {}) {
    const old = this.figs.get(kind); if (old) this.hideFig(kind);
    const o = this.figObj(kind);
    const f = { kind, obj: o, pos: pos.clone().setY(0), yaw, speed: 0, layer: opts.layer || 0, glow: opts.glow ?? 1.2 };
    this.figs.set(kind, f);
    setLayer(o.root, f.layer);
    if (o === this.entity) this.entity.setEyes(Math.max(2, Math.min(14, 2 + this.vars.num('victims') * 5)));
    this.poseFig(f, 0);
    app.renderer.shadowMap.needsUpdate = true;
    return f;
  }
  hideFig(kind) {
    const f = this.figs.get(kind); if (!f) return;
    this.figs.delete(kind);
    if (![...this.figs.values()].some((g) => g.obj === f.obj)) { f.obj.root.position.set(0, PARK_Y, 0); setLayer(f.obj.root, 0); }
    if (f.obj === this.monster) { this.monLight.intensity = 0; this.monLight.position.set(0, PARK_Y + 2, 0); }
    app.renderer.shadowMap.needsUpdate = true;
  }
  parkAll() {
    for (const o of [this.monster, this.entity, this.uncle]) { o.root.position.set(0, PARK_Y, 0); setLayer(o.root, 0); }
    this.hand.root.position.set(0, PARK_Y, 0);
    this.monLight.intensity = 0; this.monLight.position.set(0, PARK_Y + 2, 0);
    this.figs?.clear();
    if (this.eyeField) this.eyeField.visible = false;
  }
  poseFig(f, dt) {
    const o = f.obj;
    o.root.position.copy(f.pos); o.root.rotation.y = f.yaw;
    if (o === this.monster) {
      const stepped = o.rig ? animRigWalk(o, dt, app.time, f.speed, { reach: true, tiltX: -0.05 }) : animMonster(o, dt, f.speed);
      if (f.layer === 0) { this.monLight.position.set(f.pos.x - Math.sin(f.yaw) * 0.5, 1.9, f.pos.z - Math.cos(f.yaw) * 0.5); this.monLight.intensity = f.glow * (this.chicken ? 0 : 1); }
      return stepped;
    }
    if (o === this.entity) (o.rig ? animRigCreep : animEntity)(o, dt, app.time, f.speed);
    else (o.rig ? animRigDance : animUncle)(o, dt, app.time);
    return false;
  }

  /** 엔딩 1: 어둠 속에서 늘어나는 눈들 */
  buildEyeField() {
    const g = new THREE.Group(); g.name = 'EyeField'; g.visible = false; g.userData.dynamic = true;
    const mat = this.entity.eyeMat;
    this.eyes = [];
    for (let k = 0; k < 26; k++) {
      const pair = new THREE.Group();
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045), mat); e.position.x = s * 0.045; pair.add(e); }
      pair.visible = false; g.add(pair); this.eyes.push(pair);
    }
    this.scene.add(g); this.eyeField = g;
  }

  /** 플레이어 기준 방향(base)·각도·거리 후보 중, 서 있을 수 있고 사이에 벽이 없는 자리 */
  findSpot(base, dists, angles, from = null, checkLine = true) {
    const p = this.p, grid = this.reg.grid;
    const ox = from ? from.x : p.pos.x, oz = from ? from.z : p.pos.z, oyaw = from ? from.yaw : p.yaw;
    for (const a of angles) {
      for (const d of dists) {
        const yaw = oyaw + base + a;
        const x = ox - Math.sin(yaw) * d, z = oz - Math.cos(yaw) * d;
        if (!grid.circleFree(x, -z, 0.32)) continue;
        if (checkLine && !grid.lineFree(ox, -oz, x, -z, 0.05)) continue;
        return { pos: new THREE.Vector3(x, 0, z), yaw: Math.atan2(-(ox - x), -(oz - z)) };
      }
    }
    return null;
  }
  looksAt(pos, cosMin, h = 1.4) {
    const cam = app.camera;
    cam.getWorldDirection(_v1);
    _v2.copy(pos).setY(h).sub(cam.position).normalize();
    return _v1.dot(_v2) > cosMin;
  }
  lightsOut(on) { this.extBase = on ? 0 : 1; }

  // ---------- 깜짝 연출 ----------
  // 모든 깜짝 연출은 3초 예고 뒤에 일어난다. 일반 모드: 소리가 잦아든다. 겁쟁이 모드: 오른쪽 아래 카운트다운.
  async arm(ok, quiet = false) {
    if (this.chicken) {
      for (let n = 3; n > 0; n--) { if (!ok()) return false; countdown(n); app.audio.play2D('sfx_tick', 0.4); await this.sleep(1); }
      countdown(null);
    } else {
      if (!quiet) app.audio.duck(true);
      await this.sleep(3);
    }
    return ok();
  }
  async scare(a) {
    const kind = a.kind || 'twitch';
    const quiet = ['blueflash', 'mascotGlitch'].includes(kind);
    if (quiet) return this.runQuietScare(kind);
    // 준비 조건 (서 있을 때 / 앉아 있을 때)
    const need = { typing116: 'standing', chairTurn: 'standing', blindsEye: 'standing', hand: 'seated', twitch: 'seated' }[kind];
    if (need === 'standing') await this.until(() => !this.alive || this.ending || this.standing());
    if (need === 'seated') await this.until(() => !this.alive || this.ending || this.seat.seated);
    if (!this.alive || this.ending) return;
    if (this.scareBusy) { await this.until(() => !this.scareBusy || !this.alive); if (!this.alive) return; }
    const tok = ++this.scareTok;
    const ok = () => this.alive && tok === this.scareTok && !this.ending;
    this.scareBusy = true;
    try {
      const fn = {
        twitch: this.scTwitch, hand: this.scHand, typing116: this.scTyping116, cctvBehind: this.scCctvBehind, blindsEye: this.scBlindsEye,
        glassFigure: this.scGlassFigure, chairTurn: this.scChairTurn, lightsOut: this.scLightsOut, phoneKeys: this.scPhoneKeys,
      }[kind];
      if (fn) await fn.call(this, a, ok);
    } catch (e) { console.error('깜짝 연출 오류', kind, e); }
    finally {
      if (tok === this.scareTok) {
        this.scareBusy = false;
        countdown(null);
        app.audio.duck(false);
        this.extBase = 1;
      }
    }
  }
  cancelScare() {
    this.scareTok++;
    this.scareBusy = false;
    countdown(null);
    app.audio.duck(false);
    hideJumpscare();
    for (const k of ['ent', 'sup']) if (!this.chase || k !== 'sup') this.hideFig(k);
    this.hand.root.position.set(0, PARK_Y, 0);
    this.extBase = 1; this.flickerT = 0; this.leanTarget = 0; this.focus = null;
  }
  runQuietScare(kind) {
    if (kind === 'blueflash') {
      this.vars.set('sig_blue', '1');
      const run = async () => { await this.until(() => this.seat.seated || !this.alive); await this.sleep(1.2); this.term.showBsod(['']); await this.sleep(0.09); this.term.hideBsod(); app.audio.play2D('sfx_static_1', 0.25); };
      run();
    } else if (kind === 'mascotGlitch') {
      (async () => { await this.sleep(1.0); this.term.mascot.on = true; this.term.mascot.distort = 0.09; app.audio.play2D('sfx_static_2', 0.2); })();
    }
  }

  /** 앉은 시점에서 모니터 옆쪽 자리 (각도: 도, 오른쪽 +) */
  seatSpot(dist, angles) {
    const sv = this.seatView;
    const fwd = sv.n.clone().negate().setY(0).normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    return this.findSpot(0, [dist, dist + 0.4, dist - 0.3, dist + 0.8], angles.map((a) => -a * D), { x: sv.pos.x, z: sv.pos.z, yaw }, false);
  }

  /** 프롤로그: 메일을 읽는 동안 모니터 옆 어둠이 한 번 움찔 (1프레임 남짓) */
  async scTwitch(a, ok) {
    if (!(await this.arm(ok, true))) return;
    const spot = this.seatSpot(2.1, [-40, -34, -46, 38, 44]);
    if (!spot) return;
    this.showFig('ent', spot.pos, spot.yaw);
    this.term.glitchFx(0.6, 0.15);
    if (this.chicken) { this.tpVoice(0.5); await this.sleep(1.0); }
    else { app.audio.play2D('sfx_static_2', 0.35); await this.sleep(0.14); }
    this.hideFig('ent');
  }

  /** 모니터 옆에서 손가락이 책상을 짚는다 (구하지 못한 사람 1명의 전조) */
  async scHand(a, ok) {
    this.vars.set('sig_hand', '1');
    if (!(await this.arm(ok))) return;
    const A = app.audio, sv = this.seatView, h = this.hand;
    const n = sv.n.clone().setY(0).normalize(); // 화면 → 플레이어 방향
    const right = new THREE.Vector3().crossVectors(UP, n).normalize(); // 플레이어 기준 오른쪽
    if (this.chicken) {
      const pos = sv.sp.clone().addScaledVector(right, -0.75).addScaledVector(n, -0.9);
      this.showFig('ent', pos, Math.atan2(n.x, n.z));
      this.tpVoice(0.6);
      this.leanTarget = 1; await this.sleep(2.0); this.leanTarget = 0;
      this.hideFig('ent'); return;
    }
    this.term.glitchFx(0.5, 0.4);
    this.leanTarget = 1; // 몸을 뒤로 젖혀 모니터 주변이 보인다
    await this.sleep(1.1); if (!ok()) return;
    const deskY = 0.775;
    const from = sv.sp.clone().addScaledVector(right, -0.3).addScaledVector(n, -0.62).setY(deskY + 0.03);
    const to = sv.sp.clone().addScaledVector(right, -0.31).addScaledVector(n, -0.04).setY(deskY + 0.025);
    h.root.position.copy(from);
    h.root.lookAt(_v1.copy(from).sub(n));
    A.playAt('sfx_whisper', to, 0.35, 6);
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 1.2) {
      const k = Math.min(1, (this.elapsed - t0) / 1.2), e = k * k * (3 - 2 * k);
      h.root.position.lerpVectors(from, to, e);
      poseHand(h, Math.min(1, e * 1.3));
      await this.sleep(0.016);
    }
    for (let tap = 0; tap < 2 && ok(); tap++) {
      for (let k = 0; k <= 8; k++) { poseHand(h, 1, Math.sin((k / 8) * Math.PI)); await this.sleep(0.03); }
      A.playAt('sfx_desk_tap', to, 0.8, 6);
      await this.sleep(0.35);
    }
    await this.sleep(0.6);
    const t1 = this.elapsed;
    while (ok() && this.elapsed - t1 < 0.35) { const k = (this.elapsed - t1) / 0.35; h.root.position.lerpVectors(to, from, k); await this.sleep(0.016); }
    h.root.position.set(0, PARK_Y, 0);
    await this.sleep(0.4);
    this.leanTarget = 0;
  }

  /** 116 모니터에 혼자 써지는 글자 "117… 도와줘" */
  async scTyping116(a, ok) {
    this.vars.set('seen_typing', '1');
    const mon = this.reg.monitors.get('Desk116'); if (!mon) return;
    if (!(await this.arm(ok, true))) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.typing116 = { tex };
    const text = t('help116'), full = text.length;
    const draw = (n) => {
      g.fillStyle = '#020407'; g.fillRect(0, 0, 512, 384);
      g.fillStyle = '#9fd8ff'; g.font = "34px 'Galmuri11', sans-serif"; g.textBaseline = 'top';
      g.fillText(text.slice(0, n) + (Math.floor(app.time * 3) % 2 ? '_' : ''), 34, 150);
      tex.needsUpdate = true;
    };
    draw(0);
    mon.turnOn(tex, [0.8, 0.92, 1.0], 1.4, 0.4);
    mon.root.getWorldPosition(_v1);
    app.audio.playAt('sfx_crt_on', _v1, 0.5, 10);
    for (let i = 1; i <= full && ok(); i++) {
      draw(i);
      if (text[i - 1] !== ' ' && text[i - 1] !== '…') app.audio.playAt('sfx_key', _v1, 0.55, 8);
      await this.sleep(text[i - 1] === '…' ? 0.9 : 0.22);
    }
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 7) { draw(full); if (this.looksAt(_v1, 0.9, 1.0) && this.elapsed - t0 > 2.5) break; await this.sleep(0.1); }
    mon.live.uniforms.glitch && (mon.live.uniforms.glitch.value = 0.8);
    app.audio.playAt('sfx_static_3', _v1, 0.5, 10);
    await this.sleep(0.25);
    mon.turnOff(0.2);
  }

  /** CCTV 속, 내 바로 뒤에 감독관이 서 있다 (CCTV 화면에만 보인다) */
  async scCctvBehind(a, ok) {
    await this.until(() => !!this.focus || !this.alive); if (!ok()) return;
    if (!(await this.arm(ok, true))) return;
    const p = this.p;
    const back = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)); // 플레이어 뒤쪽
    const pos = p.pos.clone().addScaledVector(back, 1.05);
    const f = this.showFig('sup', pos, Math.atan2(-(p.pos.x - pos.x), -(p.pos.z - pos.z)), { layer: 2 });
    app.audio.play2D('sfx_static_1', 0.25);
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 5.5 && this.focus) {
      f.pos.copy(this.p.pos).addScaledVector(back, 1.05);
      await this.sleep(0.05);
    }
    if (this.reg.cctvMonitor?.live) this.reg.cctvMonitor.live.uniforms.glitch.value = 0.9;
    if (this.chicken) this.tpVoice(0.5); else app.audio.play2D('sfx_static_3', 0.5);
    await this.sleep(0.2);
    this.hideFig('sup');
  }

  /** 구역 A 창문 블라인드 틈의 눈 */
  async scBlindsEye(a, ok) {
    await this.until(() => !this.alive || this.ending || (this.standing() && this.inRect([-12, 1.0, -1.5, 9.5])));
    if (!(await this.arm(ok))) return;
    const wins = ['Window1', 'Window2', 'Window3'];
    let best = null;
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 8 && !best) {
      for (const w of wins) { const wp = this.anchorPos(w); if (this.looksAt(wp, 0.86, wp.y)) { best = wp; break; } }
      await this.sleep(0.08);
    }
    if (!best) return;
    const pair = this.eyes[0];
    this.eyeField.visible = true; pair.visible = true;
    pair.position.set(best.x + 0.25, best.y + 0.12, best.z - 0.12); pair.rotation.set(0, 0, 0);
    pair.scale.setScalar(this.chicken ? 0.01 : 1.4);
    if (this.chicken) { this.showFig('ent', new THREE.Vector3(best.x, 0, best.z + 0.6), 0); this.tpVoice(0.5); }
    else { app.audio.playAt('sfx_whisper', best, 0.45, 10); app.audio.play2D('js_stinger', 0.35); }
    await this.sleep(1.6);
    pair.visible = false; this.eyeField.visible = false; this.hideFig('ent');
  }

  /** 회의실 유리에 비친 실루엣 (내 등 뒤에 서 있는 것처럼, 유리 너머 안쪽에) */
  async scGlassFigure(a, ok) {
    if (!(await this.arm(ok))) return;
    const glass = new THREE.Vector3(9.25, 1.3, 4.0);
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 9 && !this.looksAt(glass, 0.72, 1.3)) await this.sleep(0.08);
    if (!ok() || !this.looksAt(glass, 0.72, 1.3)) return;
    const p = this.p;
    const x = Math.min(11.2, Math.max(6.4, p.pos.x + 0.6)), z = 6.3; // three z (= 배치 z -6.3)
    const pos = new THREE.Vector3(x, 0, z);
    this.showFig('sup', pos, Math.atan2(-(p.pos.x - x), -(p.pos.z - z)), { glow: 0.7 });
    if (this.chicken) this.tpVoice(0.5); else app.audio.play2D('sfx_static_1', 0.35);
    await this.sleep(1.3);
    this.flickerT = 0.5;
    await this.sleep(0.25);
    this.hideFig('sup');
  }

  /** 빈 의자(116)가 혼자 돌아 나를 향한다 */
  async scChairTurn(a, ok) {
    const ch = this.reg.chairs.get('Desk116'); if (!ch) return;
    await this.sleep(1.2);
    if (!(await this.arm(ok, true))) return;
    const wp = new THREE.Vector3(); ch.getWorldPosition(wp);
    const target = Math.atan2(this.p.pos.x - wp.x, this.p.pos.z - wp.z) + Math.PI;
    const parentYaw = ch.parent ? new THREE.Euler().setFromQuaternion(ch.parent.getWorldQuaternion(_q1), 'YXZ').y : 0;
    const from = ch.rotation.y, to = from + Math.atan2(Math.sin(target - parentYaw - from), Math.cos(target - parentYaw - from));
    app.audio.playAt('sfx_chair', wp, 0.8, 10);
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 1.4) { const k = (this.elapsed - t0) / 1.4, e = k * k * (3 - 2 * k); ch.rotation.y = from + (to - from) * e; app.renderer.shadowMap.needsUpdate = true; await this.sleep(0.016); }
  }

  /** 먼 천장등부터 하나씩 꺼지다 머리 위에서 멈춘다 */
  async scLightsOut(a, ok) {
    if (!(await this.arm(ok))) return;
    const ls = this.reg.ceiling.filter((l) => l.group !== 'server');
    const pos = (l) => { l.light.getWorldPosition(_v1); return _v1.distanceTo(this.p.pos); };
    ls.sort((x, y) => pos(y) - pos(x));
    for (let i = 0; i < ls.length - 1 && ok(); i++) {
      ls[i].ext = 0; ls[i].off = true;
      ls[i].light.getWorldPosition(_v1);
      app.audio.playAt('sfx_click', _v1, 0.9, 30);
      await this.sleep(0.42);
    }
    const last = ls[ls.length - 1];
    if (last) last.flicker = true;
    await this.sleep(3.0);
    for (const l of ls) { l.off = false; }
    if (last) last.flicker = false;
    app.audio.play2D('sfx_crt_on', 0.3);
  }

  /** 사내 전화: 수화기 너머로 지금 내 키보드 소리 */
  async scPhoneKeys(a, ok) {
    this.p.move = false;
    app.audio.play2D('sfx_click', 0.5);
    await this.sleep(0.6);
    const s = app.audio.play2D(this.chicken ? 'tp_ac' : 'sfx_keyboard_far', 0.7);
    monologue([t('phone1'), t('phone2')]);
    await this.sleep(4.5);
    try { s?.stop(); } catch (e) { /* */ }
    app.audio.play2D('sfx_click', 0.5);
    if (app.phase === 'play' && !this.cineLock && !this.seat.seated) this.p.move = true;
  }

  /** 겁쟁이 모드 목소리: 영상 속 "샨쎈부"(A)와 "랑쓰티치오우"(C)를 부를 때마다 번갈아 낸다 */
  tpVoice(vol = 0.5) { this.tpN = (this.tpN || 0) + 1; return app.audio.play2D(this.tpN % 2 ? 'tp_a' : 'tp_c', vol); }

  /** 길 안내 목표. delay 초 동안 못 찾으면 화면에 방향과 거리를 보여 준다 */
  setWaypoint(id, label, delay = 0) { this.wp = id ? { id, label, at: this.elapsed + delay } : null; }

  inRect(r) { const x = this.p.pos.x, z = -this.p.pos.z; return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]; }

  /** 화면을 가까이 들여다본다 (CCTV 모니터 등). dur 초 뒤 돌아온다 */
  async focusOn(mesh, fill, dur) {
    const view = this.computeSeatView(mesh, fill);
    this.p.move = this.p.look = false; setCrosshair(false);
    this.focus = { from: { pos: app.camera.position.clone(), quat: app.camera.quaternion.clone() }, view, t: 0, dir: 1 };
    await this.sleep(dur);
    if (!this.focus) return;
    this.focus.dir = -1; this.focus.t = 0; this.headPose(_v1, _q1);
    this.focus.from = { pos: app.camera.position.clone(), quat: app.camera.quaternion.clone() };
    await this.sleep(0.5);
    this.focus = null;
    if (app.phase === 'play' && !this.cineLock && !this.seat.seated) { this.p.move = this.p.look = true; setCrosshair(true); }
  }

  // ---------- 이야기 진행 ----------
  /** 지금 흐름을 버리고 다른 노드로 (엔딩 등) */
  jump(id) {
    this.storyTok++;
    const term = this.term;
    term.choices = null; term.typing = null; term.waitResolve = null; term.demo = null;
    if (term.maze) { term.maze.abort('jump'); term.maze = null; term.fast = false; }
    if (term.input) term.input = null;
    term.hideFeed();
    setObjective(null);
    this.runStory(id).catch((e) => console.error(e));
  }

  async chapterCard(id) {
    const ch = app.story.chapterById.get(id); if (!ch) return;
    if (this.seat.seated) { this.term.clearBody(); await this.term.showCard(ch.time, ch.label, ch.title); }
    else chapterCard(ch.time, ch.label, ch.title);
  }

  async runStory(id) {
    const tok = ++this.storyTok;
    const st = app.story, v = this.vars, term = this.term;
    const live = () => this.alive && tok === this.storyTok;
    let guard = 0;
    while (id && live()) {
      if (++guard > 900) { console.error('이야기 순환?'); return; }
      const node = st.nodes.get(id);
      if (!node) { console.error('노드 없음', id); return; }
      this.nodeId = id;
      if (node.chapter || node.clear) this.screenSnap = { node: id, vars: v.clone(), chapter: node.chapter || this.chapterId };
      if (node.chapter) { this.chapterId = node.chapter; if (!this.ending) saves.put('chapter', id, v, node.chapter); }
      if (node.chase) app.chaseSnapshot = { node: id, vars: v.clone() };
      for (const op of node.set) v.apply(op);
      if (node.clock) v.set('clock', node.clock);
      const lines = st.visibleLines(node.lines, v);
      const custom = node.run && SEQ_CUSTOM.has(node.run);
      if (node.chapter) { await this.chapterCard(node.chapter); if (!live()) return; }
      if (node.clear && lines.length && !custom) { await this.waitSeated(); if (!live()) return; }
      if (node.clear && !custom) term.clearBody();
      if (node.record != null) term.setHeader(v.format(node.record), v.format(node.status ?? ''), v.get('clock'));
      else term.setClock(v.get('clock'));
      for (const ev of node.onEnter) this.fire(ev);
      if (node.run === 'glanceClock') { await this.seqGlanceClock(); if (!live()) return; }
      if (!custom) {
        for (const line of lines) {
          await this.waitSeated(); if (!live()) return;
          await term.showLine(line.who, v.format(line.text), line.glitch); if (!live()) return;
          if (line.pause > 0) await this.sleep(line.pause);
        }
        const hid = st.visibleLines(node.hidden, v)[0];
        if (hid) term.setHidden(v.format(hid.text));
      }
      for (const ev of node.after) this.fire(ev);
      if (node.pause > 0) { await this.sleep(node.pause); if (!live()) return; }
      // 판정 규칙: 대사를 다 보여 준 뒤 검사
      if (!node.noRules && !this.ending) { const g = st.ruleHit(v); if (g) { id = g; continue; } }
      if (node.run && node.run !== 'glanceClock') {
        const r = await this.runSeq(node.run, node, lines);
        if (!live()) return;
        if (r === 'stop') return;
        if (typeof r === 'string' && r) { id = r; continue; }
      }
      if (node.ending) { await this.sleep(0.6); if (live()) app.flow.triggerEnding(node.ending); return; }
      if (node.maze) {
        const res = await this.runMaze(node);
        if (!live()) return;
        if (res === 'broken') { id = st.ruleHit(v) || 'end2_crack'; continue; }
        if (node.maze.kind === 'calibrate') { id = node.maze.done; continue; }
        id = (node.maze.outcomes || {})[res] || node.next;
        continue;
      }
      const choices = st.visibleChoices(node, v);
      if (choices.length) {
        await this.waitSeated(); if (!live()) return;
        if (node.save && this.screenSnap && !this.ending) saves.put('choice', this.screenSnap.node, this.screenSnap.vars, this.screenSnap.chapter);
        const p = term.showChoices(choices.map((c) => v.format(c.text)), choices.map((c) => c.unsettling), choices.map((c) => c.disabled));
        if (node.demo != null) { await this.sleep(0.8); if (live()) term.demoPick(node.demo); }
        const i = await p; if (!live()) return;
        const ch = choices[i];
        for (const op of ch.set) v.apply(op);
        for (const ev of ch.events) this.fire(ev);
        this.applyMood();
        id = ch.next; continue;
      }
      if (node.task) { await this.runTask(node.task); if (!live()) return; }
      id = st.resolveNext(node, v);
    }
  }

  /** 자리를 떠나 할 일. 끝나면 "새 기록"이 와서 다시 앉을 때까지 기다린다 */
  async runTask(task) {
    const v = this.vars, term = this.term;
    if (task.flag && !v.truthy(task.flag)) {
      const hid = term.hidden; // 숨은 주석은 다음 기록이 올 때까지 남겨 둔다
      term.clearBody(); term.hidden = hid;
      term.showCenter(v.format(task.screen || t('termWait')), '· · ·');
      const hint = v.format(task.hint || '');
      if (hint) setObjective(hint);
      if (this.seat.seated) help(t('standHint'), 8);
      const start = this.elapsed;
      let reminded = false;
      await this.until(() => {
        const w = this.elapsed - start;
        if (!reminded && w > 100 && hint) { reminded = true; setObjective(hint + t('remind')); }
        if (w > 320) v.set(task.flag, '1');
        return v.truthy(task.flag) || !this.alive;
      });
      setObjective(null);
    }
    if (task.noSit) { this.setWaypoint(null); return; }
    this.setWaypoint('Computer', '117', 12);
    term.showCenter(t('termNew'), t('termSit'));
    this.termSfx('sfx_beep_new', 0.6);
    if (!this.seat.seated) {
      await this.sleep(2.4);
      if (!this.seat.seated) setObjective(t('backToDesk'));
    }
    await this.waitSeated();
    setObjective(null);
  }

  /** 경로 추적 미로 */
  async runMaze(node) {
    const m = node.maze, def = MAZES[m.map], v = this.vars;
    if (!def) { console.error('미로 없음', m.map); return 'timeout'; }
    for (;;) {
      let time = def.time * (this.chicken ? 1.5 : 1);
      if (m.kind === 'threat') time *= Math.pow(0.75, v.num('caught'));
      const maze = new Maze(def, {
        time, kind: m.kind, drag: !!m.drag, relative: app.locked,
        previews: { subtle: m.subtle, direct: m.direct },
        labels: { start: t('mzStart'), goal: t('mzGoal'), click: t('mzClick'), timeout: t('mzTimeout'), hidden: t('mzHidden'), done: t('mzDone') },
        sfx: (n, vol) => this.termSfx(n, vol),
        onHit: (mz) => this.mazeHit(mz),
        onHidden: (mz) => this.mazeHidden(mz),
        onDrag: (mz) => this.mazeDrag(mz),
        status: () => t('mzStatus', { h: v.num('hits') % 3, c: v.num('crack') }),
      });
      this.term.clearBody();
      this.term.setHeader(t('mzTitle'), m.kind === 'calibrate' ? 'calibrate()' : t('mzSub'), v.get('clock'));
      this.term.cursor.x = 120; this.term.cursor.y = 400;
      const res = await this.term.runMaze(maze);
      if (m.kind === 'calibrate' && res === 'timeout') { await this.term.showLine('guide', t('calRetry'), 0); continue; }
      this.term.setHeader(v.format(node.record ?? ''), '', v.get('clock'));
      return res;
    }
  }
  mazeHit(maze) {
    const v = this.vars;
    v.add('hits', 1);
    const h = v.num('hits');
    if (h % 3 === 2 && this.chicken) maze.say(t('crackWarn'), 2.5);
    if (h % 3 === 0) {
      v.add('crack', 1);
      const c = v.num('crack');
      this.term.setCrack(c);
      this.termSfx('sfx_glass_crack', this.chicken ? 0.4 : 0.95);
      if (!this.chicken) { const img = app.images.get('reflect_face'); if (img) this.term.flashFace(img, 0.11); flash(0.15); }
      if (c >= 3) setTimeout(() => maze.abort('broken'), 400);
    }
  }
  mazeHidden(maze) {
    const v = this.vars;
    v.add('annoy', 1); v.add('hidden_n', 1);
    const n = Math.min(3, v.num('hidden_n'));
    maze.say(t('spGuide') + t('whoIs' + n), 3.6);
    this.applyMood();
  }
  async mazeDrag(maze) {
    const ok = () => this.alive && !maze.result;
    if (this.chicken) {
      for (let n = 3; n > 0; n--) { if (!ok()) return; countdown(n); app.audio.play2D('sfx_tick', 0.4); await this.sleep(1); }
      countdown(null);
      if (ok()) { maze.drag(110); app.audio.play2D('sfx_boing', 0.5); }
    } else {
      app.audio.play2D('sfx_whisper', 0.4);
      maze.drag(300);
    }
  }

  // ---------- 코드 연출 ----------
  async runSeq(name, node, lines) {
    switch (name) {
      case 'freeze': await app.flow.fakeFreeze(); await this.term.showLine('guide', t('notOver'), 0.2); return '';
      case 'finalWait': return this.seqFinalWait();
      case 'chase': { const esc = await this.runChase(); return esc ? node.chase.escaped : node.chase.caught; }
      case 'end1': return this.seqEnd1(node, lines);
      case 'end3': return this.seqEnd3(node);
      case 'end4': return this.seqEnd4(node);
      case 'end5': return this.seqEnd5(node, lines);
      case 'end6': return this.seqEnd6(node);
    }
    return '';
  }

  /** 01:58: 고개를 들어 벽시계를 본다 */
  async seqGlanceClock() {
    await this.waitSeated();
    const clock = this.anchorPos('Clock');
    this.glance = { target: clock, t: 0, dur: 3.4 };
    app.audio.play2D('sfx_tick', 0.25);
    await this.sleep(3.4);
    this.glance = null;
  }

  async seqFinalWait() {
    const v = this.vars;
    for (const c of ['05:54', '05:56', '05:58', '05:59']) { await this.sleep(3.2); if (!this.alive) return 'stop'; v.set('clock', c); this.term.setClock(c); }
    await this.sleep(2.5);
    return '';
  }

  /** 엔딩 1: 정전 → 늘어나는 눈 → 명령 입력은 계속 "권한 없음" → 그것이 덮친다 */
  async seqEnd1(node, lines) {
    this.ending = true;
    const A = app.audio, term = this.term, v = this.vars;
    await this.waitSeated();
    A.silenceAll(); A.setHum(false, 0.3);
    this.lightsOut(true);
    A.play2D('sfx_power_down', 0.7);
    await this.sleep(1.2);
    term.clearBody(); term.setHeader('', '', '');
    // 눈이 하나씩
    const sv = this.seatView;
    this.eyeField.visible = true;
    const showEye = (k) => {
      const e = this.eyes[k]; if (!e) return;
      const ang = (Math.random() * 1.4 - 0.7) + Math.PI, dist = 2 + Math.random() * 5;
      const fwd = Math.atan2(sv.n.x, sv.n.z);
      e.position.set(sv.pos.x + Math.sin(fwd + ang) * dist, 0.9 + Math.random() * 1.4, sv.pos.z + Math.cos(fwd + ang) * dist);
      e.lookAt(sv.pos); e.visible = !this.chicken;
    };
    if (this.chicken) { const s = this.seatSpot(1.8, [-30, 30, -40, 40]); if (s) this.showFig('ent', s.pos, s.yaw); this.tpVoice(0.55); }
    for (let k = 0; k < 6; k++) { showEye(k); await this.sleep(0.4); }
    const say = lines.map((l) => v.format(l.text));
    for (let k = 0; k < 3 && this.alive; k++) {
      await term.showLine('sys', say[0] || '>', 0.2);
      app.flow.startTyping?.();
      await Promise.race([term.startInput('> '), this.sleep(11).then(() => term.submitInput())]);
      app.flow.stopTyping?.();
      await term.showLine('sys', say[1] || '권한 없음', 0.4 + k * 0.2);
      for (let j = 0; j < 5; j++) showEye(6 + k * 6 + j);
      A.play2D('sfx_static_' + (1 + k), 0.4 + k * 0.15);
    }
    await term.showLine('ai', say[2] || '', 0.6);
    await this.sleep(0.8);
    if (!(await this.arm(() => this.alive, true))) return 'stop';
    if (this.chicken) { jumpscare('uncle', 1.6); A.play2D('tp_ac', 0.95); }
    else { jumpscare('ent', 1.4); A.play2D('sfx_echo_scream', 1.0); flash(0.8); shake(0.08, 0.9); }
    await this.sleep(1.3);
    setFade(1);
    return '';
  }

  /** 엔딩 3: 가짜 블루스크린 → CRT 가 꺼지며 진짜 타이틀로 */
  async seqEnd3(node) {
    this.ending = true;
    const term = this.term, A = app.audio;
    await this.waitSeated();
    A.silenceAll();
    term.showBsod(t('bsod').split('\n'));
    A.play2D('sfx_bsod', 0.7);
    await this.sleep(5.2);
    term.setPower(0, 0.5);
    await this.sleep(0.9);
    await fadeTo(1, 0.6);
    app.flow.finishEnding('END_3', { toTitle: true });
    return 'stop';
  }

  /** 엔딩 4: 전원을 뽑는다 → 정전 → 숨은 직원용 문이 열린다 → 공허로 걸어 들어간다 */
  async seqEnd4(node) {
    this.ending = true;
    const A = app.audio, reg = this.reg, term = this.term;
    if (this.seat.seated || this.seat.dir) this.stand(true);
    this.cancelScare();
    setObjective(null);
    const ps = reg.powerStrip; if (ps) ps.plug.position.y = 0.09;
    monologue([t('spGuide') + t('guideStop2')]);
    A.play2D('sfx_click', 0.8);
    await this.sleep(0.5);
    // 정전: 단말기·조명이 꺼지고 비상등만
    term.setPower(0, 0.15);
    A.play2D('sfx_power_down', 0.9); A.setHum(false, 0.2); A.silenceAll();
    for (const l of reg.ceiling) { if (l.group === 'server') continue; l.fadeTo(0.1, 0.2); l.flicker = false; }
    for (const m of reg.dead) m.turnOff(0.1);
    for (const [k, lp] of this.loops) { A.fadeLoop(lp, 0.3); } this.loops.clear();
    this.vars.set('unplugged', '1');
    await this.sleep(2.2);
    const sd = reg.doors.get('StaffDoor');
    A.playAt('sfx_maglock', this.anchorPos('StaffDoor'), 1.0, 40);
    caption(t('maglock'));
    if (sd) { sd.setLocked(false); sd.setOpen(0.18, 0.6); }
    reg.voidFloor.visible = true;
    this.loops.set('void', A.loop3D('sfx_freeze', this.anchorObj('VoidPoint'), 0.5, 4, 30));
    await this.sleep(1.0);
    setObjective(t('voidObj'));
    const vp = this.anchorPos('VoidPoint');
    await this.until(() => !this.alive || (-this.p.pos.z < -4.3 && this.p.pos.x > 16.5) || Math.hypot(this.p.pos.x - vp.x, this.p.pos.z - vp.z) < 4);
    setObjective(null);
    this.p.move = false;
    await this.sleep(1.5);
    await fadeTo(1, 3.0);
    return '';
  }

  /** 엔딩 5: 초록 글씨 텍스트 어드벤처 */
  async seqEnd5(node, lines) {
    this.ending = true;
    const term = this.term, v = this.vars, A = app.audio;
    await this.waitSeated();
    if (lines[0]) await term.showLine('guide', v.format(lines[0].text), 0.3);
    await this.sleep(0.8);
    A.play2D('sfx_static_3', 0.5);
    term.glitchFx(0.9, 0.6);
    await this.sleep(0.6);
    term.setTheme('green'); term.clearBody(); term.setHeader(t('taTitle'), '', '');
    await term.showLine('sys', t('taIntro'), 0);
    let n = 0, unknown = 0;
    for (;;) {
      if (!this.alive) return 'stop';
      app.flow.startTyping?.();
      const raw = (await term.startInput('> ')) || '';
      app.flow.stopTyping?.();
      const cmd = raw.trim().toLowerCase();
      n++;
      term.lines.push({ who: 'me', prefix: '> ', pc: '#4dff6a', bc: '#b6ffbf', text: raw, shown: raw.length, glitch: 0, settle: 0 });
      const has = (...ws) => ws.some((w) => cmd.includes(w));
      if (has('quit', 'exit', '나가기', '종료')) { await term.showLine('guide', t('taQuit'), 0.3); break; }
      let reply;
      if (has('도움', 'help', '?')) reply = t('taHelp');
      else if (has('보기', 'look', '봐')) reply = t('taLook');
      else if (has('가기', 'go ', '가 ', 'walk', '이동')) reply = t('taGo');
      else if (has('누구', 'who')) reply = t('taWho');
      else if (has('일', 'work')) reply = t('taWork');
      else if (has('말', 'talk', 'say', '안녕', 'hi')) reply = t('taTalk');
      else { unknown++; reply = unknown >= 3 ? t('taHint') : t('taUnknown'); }
      await term.showLine(reply.startsWith('가이드') || reply.startsWith('GUIDE') ? 'guide' : 'sys', reply.replace(/^(가이드|GUIDE): /, ''), 0);
      if (n === 6) await term.showLine('guide', t('taHint'), 0);
    }
    await this.sleep(1.5);
    await fadeTo(1, 1.5);
    return '';
  }

  /** 엔딩 6: 06:00, 모델이 보낸 마지막 로그 */
  async seqEnd6(node) {
    this.ending = true;
    const term = this.term, A = app.audio, reg = this.reg;
    await this.waitSeated();
    A.setTension(0);
    term.clearBody(); term.setHeader(t('end6Rec'), t('end6Sub'), '06:00');
    // 창밖이 밝아진다
    const bd = reg.backdrop;
    const t0 = this.elapsed;
    const brighten = async () => { while (this.alive && this.elapsed - t0 < 10) { const k = Math.min(1, (this.elapsed - t0) / 10); if (bd) bd.material.color.setRGB(0.55 + k * 0.45, 0.6 + k * 0.3, 0.75 + k * 0.15); await this.sleep(0.05); } };
    brighten();
    for (const key of ['end6a', 'end6b', 'end6c']) { await term.showLine('ai', t(key), key === 'end6a' ? 0.3 : 0); await this.sleep(0.6); }
    await this.sleep(1.5);
    await fadeTo(1, 2.4);
    return '';
  }

  // ---------- 추격 (엔딩 2) ----------
  runChase() {
    return new Promise((resolve) => {
      const spawn = this.anchorPos('SupSpawn');
      const ch = {
        pos: new THREE.Vector3(spawn.x, 0, spawn.z), yaw: Math.PI / 2,
        exit: this.anchorPos('ExitPoint'), shown: false, released: false, intro: null, t: 0, speed: 0, done: false, resolve,
        loops: null, audioMode: null, stepN: 0, path: null, pathT: 0, fig: null,
        exitIt: this.reg.its.get('ExitDoor'),
      };
      ch.exitIt?.add(t('pExit'), () => !ch.done && ch.released, () => this.escape(ch), 50, ch);
      this.chase = ch;
      this.ending = true;
      this.chaseIntro(ch).catch((e) => console.error(e));
    });
  }
  async chaseIntro(ch) {
    const A = app.audio, reg = this.reg, term = this.term;
    this.cineLock = true;
    if (!this.seat.seated && !this.seat.dir) { this.p.move = this.p.look = false; setCrosshair(false); }
    reg.doors.get('ExitDoor')?.setLocked(false);
    A.setMusic('chase'); A.setTension(3); this.term.tension = 3;
    this.loops.set('alarm', A.loop3D('sfx_alarm', this.anchorObj('player'), this.chicken ? 0.2 : 0.55, 2, 60));
    this.flickerT = 1.2;
    // 1) 서버실 CCTV: 어둠 속 감독관
    const cam3 = this.reg.cctvs.get('CAM3');
    this.setFeedCam('CAM3'); this.feed.toTerm = true;
    let yaw0 = Math.PI / 2;
    if (cam3) { cam3.root.getWorldPosition(_v1); yaw0 = Math.atan2(-(_v1.x - ch.pos.x), -(_v1.z - ch.pos.z)); }
    ch.yaw = yaw0;
    ch.fig = this.showFig('sup', ch.pos, ch.yaw, { glow: 0.9 });
    ch.shown = true;
    if (this.seat.seated) { term.showFeed(this.feed.rt.texture); await this.sleep(3.4); term.hideFeed(); }
    else await this.sleep(1.0);
    this.feed.toTerm = false;
    if (!this.alive || ch.done) return;
    // 2) 일어난다
    if (this.seat.seated) this.stand(false);
    await this.until(() => !this.seat.seated && !this.seat.dir);
    setCrosshair(false);
    // 3) 멀리 서버실 문이 열리고 걸어 나온다 (카메라가 확대해서 보여 줌)
    const sdoor = reg.doors.get('ServerDoor');
    if (sdoor) { sdoor.setLocked(false); sdoor.setOpen(1, 0.35); A.playAt('sfx_door_bang', this.anchorPos('ServerDoor'), 1.0, 40); }
    const dp = this.anchorPos('ServerDoor');
    ch.intro = new THREE.Vector3(dp.x - 1.1, 0, dp.z);
    const h = this.chicken ? 1.2 : 1.6;
    this.lookAim = { get: () => _aim.set(ch.pos.x, h, ch.pos.z), k: 5 };
    this.fovTarget = this.chicken ? 26 : 28;
    if (!this.chicken) A.playAt('mon_roar', dp, 0.9, 40);
    await this.until(() => !ch.intro || ch.done || !this.alive);
    await this.sleep(0.9);
    if (ch.done || !this.alive) return;
    // 4) 비상구 쪽을 보여 주고 조작을 돌려준다
    const ex = this.anchorPos('Room_corridor');
    this.fovTarget = FOV;
    this.lookAim = { get: () => ex, k: 4 };
    await this.sleep(1.0);
    this.cineLock = false; this.lookAim = null; this.fovTarget = FOV;
    if (app.phase === 'play') { this.p.move = this.p.look = true; setCrosshair(true); }
    this.nav = this.nav || new NavGrid(reg.grid, 0.25, 0.3);
    this.startTopdown();
    setObjective(t('runObj'));
    help(t('runHelpTop'), 7);
    ch.released = true;
  }

  // ---------- 위에서 내려다보는 CCTV 추격 화면 ----------
  startTopdown() {
    const cam = app.camera;
    this.topdown = { pos: new THREE.Vector3(this.p.pos.x, 10, this.p.pos.z + 3.2) };
    cam.layers.disable(3); cam.layers.enable(1);
    this.fovTarget = 52; cam.fov = 52; cam.updateProjectionMatrix();
    app.flow.cctvOverlay?.(true);
    flash(0.6); app.audio.play2D('sfx_static_2', 0.45);
    this.p.look = false; setCrosshair(false);
  }
  stopTopdown() {
    if (!this.topdown) return;
    this.topdown = null;
    const cam = app.camera; cam.layers.enable(3); cam.layers.disable(1);
    this.fovTarget = FOV;
    app.flow.cctvOverlay?.(false);
  }
  /** 추격 중 탈출로의 캐비닛이 쓰러진다 (가까이 가면) */
  updateCabinets(dt) {
    const ch = this.chase;
    if (!ch || !ch.released || ch.done) return;
    for (const c of this.reg.fallCabs) {
      if (c.state === 0) {
        const d = Math.hypot(this.p.pos.x - c.pos[0], -this.p.pos.z - c.pos[1]);
        if (d < 3.4) { c.state = 1; c.t = 0; app.audio.playAt('sfx_chair', _v1.set(c.pos[0], 1.2, -c.pos[1]), 0.9, 12); }
      } else if (c.state === 1) {
        c.t += dt;
        const k = Math.min(1, c.t / 0.6);
        c.pivot.rotation.x = k * k * (Math.PI / 2);
        app.renderer.shadowMap.needsUpdate = true;
        if (k >= 1) { c.state = 2; this.landCabinet(c); }
      }
    }
  }
  landCabinet(c) {
    const grid = this.reg.grid, p = this.p;
    const cx = c.edge[0] + c.dir[0] * 0.66, cz = c.edge[1] + c.dir[1] * 0.66;
    grid.rect(cx, cz, 0.46, 1.32, c.rot, grid.block);
    _v1.set(cx, 0.5, -cz);
    app.audio.playAt('sfx_door_bang', _v1, 1.0, 26);
    if (this.nav) {
      const n = this.nav, r = c.rot * D, cs = Math.cos(r), sn = Math.sin(r);
      for (let j = 0; j < n.h; j++) for (let i = 0; i < n.w; i++) {
        const x = n.x0 + (i + 0.5) * n.cell - cx, z = n.z0 + (j + 0.5) * n.cell - cz;
        if (Math.abs(x) > 1.2 || Math.abs(z) > 1.2) continue;
        const lx = x * cs - z * sn, lz = x * sn + z * cs;
        if (Math.abs(lx) <= 0.23 + 0.3 && Math.abs(lz) <= 0.66 + 0.3) n.free[j * n.w + i] = 0;
      }
      if (this.chase) this.chase.pathT = 0;
    }
    // 밑에 깔리면 비틀거리며 밀려난다
    if (!grid.circleFree(p.pos.x, -p.pos.z, RADIUS)) {
      this.stagger = 1.3; shake(0.05, 0.5); flash(0.25);
      for (let rad = 0.2; rad < 2.5; rad += 0.1) {
        let done = false;
        for (let a = 0; a < 16; a++) {
          const an = (a / 16) * Math.PI * 2, x = p.pos.x + Math.cos(an) * rad, z = p.pos.z + Math.sin(an) * rad;
          if (grid.circleFree(x, -z, RADIUS)) { p.pos.x = x; p.pos.z = z; done = true; break; }
        }
        if (done) break;
      }
    } else if (Math.hypot(p.pos.x - cx, -p.pos.z - cz) < 2.2) shake(0.025, 0.3);
  }
  ensureChaseAudio(ch) {
    const mode = this.chicken ? 'uncle' : 'monster';
    if (ch.audioMode === mode) return;
    this.stopChaseAudio(ch);
    const A = app.audio;
    ch.loops = mode === 'uncle'
      ? []
      : [A.loop3D('mon_breath', this.monster.P.head, 0.85, 0.8, 14, true), A.loop3D('mon_static', this.monster.P.head, 0.3, 0.6, 10), A.loop3D('mon_drag', this.monster.root, 0.45, 1, 13)];
    ch.audioMode = mode;
  }
  stopChaseAudio(ch) { for (const lp of ch.loops || []) if (lp) app.audio.fadeLoop(lp, 0.15); ch.loops = null; ch.audioMode = null; }
  endChase(ch) {
    ch.done = true;
    this.stopTopdown();
    this.cineLock = false; this.lookAim = null; this.fovTarget = FOV;
    this.stopChaseAudio(ch);
    ch.exitIt?.removeOwner(ch);
    app.audio.fadeLoop(this.loops.get('alarm'), 0.4); this.loops.delete('alarm');
  }
  escape(ch) {
    if (ch.done) return;
    this.endChase(ch);
    this.p.move = this.p.look = false;
    this.reg.doors.get('ExitDoor')?.setOpen(1, 0.8);
    app.audio.playAt('sfx_door_open', this.anchorPos('ExitDoor'), 0.7, 10);
    this.hideFig('sup');
    this.chase = null;
    ch.resolve(true);
  }
  async caught(ch) {
    if (ch.done) return;
    this.endChase(ch);
    this.p.move = this.p.look = false;
    setCrosshair(false); setObjective(null);
    const A = app.audio;
    if (this.chicken) {
      for (let n = 3; n > 0; n--) { countdown(n); A.play2D('sfx_tick', 0.4); await this.sleep(1); }
      countdown(null);
      jumpscare('uncle', 1.6); A.play2D('tp_ac', 0.95);
      await this.sleep(1.5);
    } else {
      A.silenceAll();
      jumpscare('sup', 1.3); A.play2D('js_shriek', 1.0); A.play2D('mon_roar', 0.7); flash(0.8); shake(0.08, 0.9);
      await this.sleep(1.15);
    }
    setFade(1); hideJumpscare();
    A.silenceAll(); A.stopAllLoops();
    this.hideFig('sup');
    this.chase = null;
    ch.resolve(false);
  }

  updateChase(dt) {
    const ch = this.chase; if (!ch || ch.done) return;
    const p = this.p.pos;
    if (ch.released && Math.hypot(p.x - ch.exit.x, p.z - ch.exit.z) < 1.15) { this.escape(ch); return; }
    if (!ch.shown || !ch.fig) return;
    this.ensureChaseAudio(ch);
    const c = ch.pos;
    let speed = 0;
    if (ch.released) {
      ch.t += dt;
      const [s0, s1, ramp] = this.chicken ? [UNCLE_SPEED, UNCLE_SPEED, 1] : [2.5, 4.15, 8];
      ch.speed = s0 + (s1 - s0) * Math.min(1, ch.t / ramp);
      speed = this.chicken ? ch.speed : ch.speed * (0.8 + 0.3 * Math.abs(Math.sin(this.monster.phase)));
      // 길찾기 (0.4초마다 다시)
      ch.pathT -= dt;
      const cU0 = c.x, cU1 = -c.z, pU0 = p.x, pU1 = -p.z;
      if (ch.pathT <= 0 || !ch.path) { ch.pathT = 0.4; ch.path = this.nav ? this.nav.path(cU0, cU1, pU0, pU1) : [[pU0, pU1]]; }
      let tgt = [pU0, pU1];
      const grid = this.reg.grid;
      if (!grid.lineFree(cU0, cU1, pU0, pU1, 0.25) && ch.path && ch.path.length) {
        while (ch.path.length > 1 && Math.hypot(ch.path[0][0] - cU0, ch.path[0][1] - cU1) < 0.2) ch.path.shift();
        let pick = 0;
        for (let i = Math.min(ch.path.length - 1, 10); i > 0; i--) { if (grid.lineFree(cU0, cU1, ch.path[i][0], ch.path[i][1], 0.25)) { pick = i; break; } }
        tgt = ch.path[pick];
      }
      const dx = tgt[0] - cU0, dz = tgt[1] - cU1, dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        const st = Math.min(dist, speed * dt);
        c.x += (dx / dist) * st; c.z -= (dz / dist) * st;
        ch.yaw = lerpAngle(ch.yaw, Math.atan2(-dx, dz), Math.min(1, dt * 8));
      }
    } else if (ch.intro) {
      const dx = ch.intro.x - c.x, dz = ch.intro.z - c.z, d = Math.hypot(dx, dz);
      if (d < 0.05) ch.intro = null;
      else {
        const st = Math.min(d, 1.8 * dt);
        c.x += (dx / d) * st; c.z += (dz / d) * st; speed = 1.8;
        ch.yaw = lerpAngle(ch.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 6));
      }
    }
    ch.fig.pos.copy(c); ch.fig.yaw = ch.yaw; ch.fig.speed = speed;
    // 겁쟁이 모드: 영상 속 "샨쎈부!"(A)와 "랑쓰티치오우!"(C)를 쉬지 않고 번갈아 외치며 춤추며 다가온다
    if (this.chicken && ch.released) {
      ch.voiceT = (ch.voiceT ?? 0.3) - dt;
      if (ch.voiceT <= 0) {
        const first = !ch.voiceB; ch.voiceB = first;
        _v3.set(c.x, 1.6, c.z);
        app.audio.playAt(first ? 'tp_a' : 'tp_c', _v3, 1.0, 30, 0);
        ch.voiceT = (first ? 0.78 : 1.1) + 0.12;
      }
    }
    if (ch.released && Math.hypot(p.x - c.x, p.z - c.z) < 0.85) this.caught(ch);
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    this.elapsed += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.r(); } }
    for (let i = this.waiters.length - 1; i >= 0; i--) { const w = this.waiters[i]; if (w.pred()) { this.waiters.splice(i, 1); w.r(); } }
    const reg = this.reg;
    this.updateLights(dt);
    this.updateGuide(dt);
    let shadow = false;
    for (const d of reg.doors.values()) { if (d.busy) shadow = true; d.update(dt); }
    if (this.rattle) {
      const r = this.rattle, d = r.door;
      r.t -= dt;
      if (r.t > 0) d.pivot.rotation.y = -(d.baseYaw + d.openYaw * d.amount) * D + Math.sin(r.t * 70) * r.amp * (r.t / 0.7);
      else { d.applyRot(); this.rattle = null; }
      shadow = true;
    }
    for (const m of reg.dead) m.update(dt, app.time);
    reg.cctvMonitor?.update(dt, app.time);
    // 프린터 종이
    const pr = reg.printer;
    if (pr && pr.t >= 0 && pr.t < 2.6) {
      pr.t += dt;
      const k = Math.min(1, pr.t / 2.4);
      pr.sheet.position.z = -(pr.closedZ - 0.26 * k);
      if (pr.t >= 2.6) { pr.pile.visible = true; pr.sheet.position.z = -pr.closedZ; pr.led.material = pr.ledIdle; }
      shadow = true;
    }
    if (this.fog.t < 1 && !this.chicken) { this.fog.t = Math.min(1, this.fog.t + dt / this.fog.dur); this.scene.fog.density = this.fog.from + (this.fog.to - this.fog.from) * this.fog.t; }
    for (let i = this.zones.length - 1; i >= 0; i--) { const z = this.zones[i]; if (this.standing() && this.inRect(z.rect)) { if (z.once) this.zones.splice(i, 1); z.fn(); } }
    this.updateClock(dt);
    this.updateCctv(dt);
    this.updatePlayer(dt);
    this.updateChase(dt);
    this.updateCabinets(dt);
    this.updateWhisper(dt);
    const cam = app.camera;
    if (Math.abs(cam.fov - this.fovTarget) > 0.02) { cam.fov += (this.fovTarget - cam.fov) * (1 - Math.exp(-3.5 * dt)); cam.updateProjectionMatrix(); }
    let moving = false;
    for (const f of this.figs.values()) {
      if (this.chase && f === this.chase.fig) {
        if (this.poseFig(f, dt) && !this.chicken) app.audio.playAt('mon_step_' + (1 + (this.chase.stepN++ % 3)), f.pos, 0.9, 24, 0.06);
      } else this.poseFig(f, dt);
      moving = true;
    }
    if (this.eyeField.visible) moving = true;
    if (moving) { this.shadowAcc += dt; if (this.shadowAcc >= 1 / 30) { this.shadowAcc = 0; shadow = true; } }
    if (shadow) app.renderer.shadowMap.needsUpdate = true;
    this.term.update(dt, app.time);
    this.updateAvatar();
    if (this.playerObj) this.playerObj.position.copy(this.p.pos).setY(1.2);
  }

  /** 등 뒤의 속삭임: 구하지 못한 사람이 있으면, 서서 걸을 때 가끔 바로 뒤에서. 돌아보면 멈춘다 */
  updateWhisper(dt) {
    const v = this.vars;
    if (this.whisper) {
      const w = this.whisper; w.t -= dt;
      const turned = Math.abs(Math.atan2(Math.sin(this.p.yaw - w.yaw0), Math.cos(this.p.yaw - w.yaw0))) > 2.0;
      if (w.t <= 0 || turned || !this.standing()) { app.audio.fadeLoop(w.lp, turned ? 0.08 : 0.5); this.whisper = null; }
      else { const back = _v1.set(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw)); w.obj.position.copy(this.p.pos).addScaledVector(back, 0.7).setY(1.55); }
      return;
    }
    if (v.num('victims') < 1 || !this.standing() || this.chase || this.ending || this.scareBusy) return;
    this.whisperT -= dt;
    if (this.whisperT > 0) return;
    this.whisperT = 70 + Math.random() * 50;
    const obj = this.whisperObj || (this.whisperObj = new THREE.Object3D());
    if (!obj.parent) this.scene.add(obj);
    obj.position.copy(this.p.pos).setY(1.55);
    const lp = app.audio.loop3D(this.chicken ? 'tp_ac' : 'sfx_whisper', obj, this.chicken ? 0.45 : 0.55, 0.4, 5, true);
    this.whisper = { lp, obj, t: 3.4, yaw0: this.p.yaw };
  }

  /** 천장등: 이야기 값 × 정전·깜빡임 연출 */
  updateLights(dt) {
    let ext = this.extBase;
    if (this.flickerT > 0) {
      this.flickerT -= dt; this.flickT -= dt;
      if (this.flickT <= 0) { this.flickT = 0.04 + Math.random() * 0.11; this.flickV = Math.random() < 0.45 ? 0.06 : 1; }
      ext *= this.chicken ? 1 : this.flickV;
    }
    for (const l of this.reg.ceiling) { l.ext = l.off && !this.chicken ? 0 : ext; l.update(dt); }
  }

  updateClock(dt) {
    const c = this.reg.clock; if (!c) return;
    c.drift = Math.min(c.drift + dt / 30, 1.5);
    const [h, m] = (this.vars.get('clock') || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
    if (c.last !== h * 60 + m) { c.last = h * 60 + m; c.drift = 0; }
    const mins = h * 60 + m + c.drift;
    c.minute.rotation.z = -((mins % 60) * 6) * D;
    c.hour.rotation.z = -(((mins / 60) % 12) * 30) * D;
  }

  updateCctv(dt) {
    const f = this.feed;
    if (f && (f.on || f.toTerm)) {
      f.t -= dt;
      if (f.t <= 0) {
        f.t = 1 / 12;
        const scr = this.reg.cctvMonitor?.mesh, r = app.renderer;
        if (scr) scr.visible = false;
        r.setRenderTarget(f.rt);
        r.render(this.scene, f.cam);
        r.setRenderTarget(null);
        if (scr) scr.visible = true;
      }
    }
  }

  updateAvatar() {
    const av = this.reg.avatar;
    const seated = !!av.userData.isSeated;
    if (seated && av.userData.seatPoint) {
      av.userData.seatPoint.getWorldPosition(av.position);
      av.userData.seatPoint.getWorldQuaternion(av.quaternion);
    } else { av.position.copy(this.p.pos); av.rotation.set(0, this.p.yaw, 0); }
    av.userData.standingPose.visible = !seated; av.userData.seatedPose.visible = seated;
  }

  updatePlayer(dt) {
    const p = this.p, cam = app.camera, grid = this.reg.grid;
    const seat = this.seat;
    // 화면 들여다보기 (CCTV)
    if (this.focus) {
      const f = this.focus; f.t = Math.min(1, f.t + dt / 0.5);
      const e = f.t * f.t * (3 - 2 * f.t);
      if (f.dir > 0) { cam.position.lerpVectors(f.from.pos, f.view.pos, e); cam.quaternion.slerpQuaternions(f.from.quat, f.view.quat, e); }
      else { this.headPose(_v1, _q1); cam.position.lerpVectors(f.from.pos, _v1, e); cam.quaternion.slerpQuaternions(f.from.quat, _q1, e); }
      setPrompt(null);
      return;
    }
    if (seat.dir !== 0) {
      seat.trans = Math.min(1, seat.trans + dt / (seat.dir > 0 ? 0.6 : 0.5));
      const e = seat.trans * seat.trans * (3 - 2 * seat.trans);
      if (seat.dir > 0) { seat.toPos.copy(this.seatView.pos); seat.toQuat.copy(this.seatView.quat); }
      else this.headPose(seat.toPos, seat.toQuat);
      cam.position.lerpVectors(seat.from.pos, seat.toPos, e);
      cam.quaternion.slerpQuaternions(seat.from.quat, seat.toQuat, e);
      if (seat.trans >= 1) {
        if (seat.dir > 0) { seat.seated = true; this.term.acceptInput = true; this.vars.set('sat_once', '1'); if (this.wp && this.wp.id === 'Computer') this.wp = null; if (app.flow.onSeated) app.flow.onSeated(); }
        else this.finishStand();
        seat.dir = 0;
      }
      return;
    }
    if (seat.seated) {
      seat.breathe += dt;
      this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 2.2);
      const sv = this.seatView;
      cam.position.copy(sv.pos).addScaledVector(sv.n, this.lean * 0.42).y += Math.sin(seat.breathe * 1.1) * 0.0015 + this.lean * 0.08;
      cam.quaternion.copy(sv.quat);
      if (this.glance) {
        const g = this.glance; g.t += dt;
        const k = g.t < 0.8 ? g.t / 0.8 : g.t > g.dur - 0.8 ? Math.max(0, (g.dur - g.t) / 0.8) : 1, e = k * k * (3 - 2 * k);
        cam.position.addScaledVector(sv.n, e * 0.35).y += e * 0.22;
        _m1.lookAt(cam.position, g.target, UP); _q1.setFromRotationMatrix(_m1);
        cam.quaternion.slerp(_q1, e);
      }
      return;
    }
    if (this.lookAim) {
      const tg = this.lookAim.get();
      const dx = tg.x - p.pos.x, dy = tg.y - EYE, dz = tg.z - p.pos.z;
      const k = 1 - Math.exp(-this.lookAim.k * dt);
      p.yaw = lerpAngle(p.yaw, Math.atan2(-dx, -dz), k);
      p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    }
    let fx = 0, fz = 0;
    if (this.stagger > 0) this.stagger -= dt;
    if (p.move) {
      const k = keys;
      const z = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const len = Math.hypot(x, z);
      if (len > 0) {
        p.sprint = (k.ShiftLeft || k.ShiftRight) && (z > 0 || !!this.topdown);
        const sp = (p.sprint ? SPRINT : WALK) / Math.max(1, len) * (this.stagger > 0 ? 0.4 : 1);
        if (this.topdown) { fx = x * sp; fz = -z * sp; p.yaw = lerpAngle(p.yaw, Math.atan2(-fx, -fz), Math.min(1, dt * 12)); }
        else {
          const f0 = -Math.sin(p.yaw), f1 = -Math.cos(p.yaw), r0 = Math.cos(p.yaw), r1 = -Math.sin(p.yaw);
          fx = (f0 * z + r0 * x) * sp; fz = (f1 * z + r1 * x) * sp;
        }
      } else p.sprint = false;
    }
    const ox = p.pos.x, oz = p.pos.z;
    const nx = ox + fx * dt, nz = oz + fz * dt;
    if (fx !== 0 && grid.circleFree(nx, -oz, RADIUS)) p.pos.x = nx;
    if (fz !== 0 && grid.circleFree(p.pos.x, -nz, RADIUS)) p.pos.z = nz;
    const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
    p.moving = moved / Math.max(dt, 1e-4) > 0.3;
    if (p.moving) {
      p.stepAcc += moved;
      if (p.stepAcc >= (p.sprint ? 0.95 : 0.68)) { p.stepAcc = 0; app.audio.step(this.onTile(), p.sprint); }
      p.bob += dt * (p.sprint ? 13 : 8.5);
    } else p.stepAcc = 0.5;
    const amp = p.moving ? (p.sprint ? 0.035 : 0.018) : 0;
    p.bobY += (Math.abs(Math.sin(p.bob)) * amp - p.bobY) * Math.min(1, dt * 10);
    if (this.topdown) {
      const td = this.topdown;
      _v1.set(p.pos.x, 10.5, p.pos.z + 3.4);
      td.pos.lerp(_v1, Math.min(1, dt * 4));
      cam.position.copy(td.pos);
      cam.lookAt(td.pos.x, 0.2, td.pos.z - 3.9);
      this.earObj.position.set(p.pos.x, EYE, p.pos.z); this.earObj.rotation.set(0, 0, 0);
      setPrompt(null);
      return;
    }
    this.headPose(cam.position, cam.quaternion);
    this.current = null;
    let prompt = null;
    if (p.move && app.phase === 'play' && !app.paused) {
      this.ray.setFromCamera(_c0, cam);
      const hits = this.ray.intersectObjects(this.reg.hit, false);
      if (hits.length) {
        const it = hits[0].object.userData.it;
        const h = it?.active();
        if (h) { this.current = it; prompt = h.prompt; }
      }
    }
    setPrompt(prompt);
  }
  onTile() {
    const x = this.p.pos.x, z = -this.p.pos.z;
    for (const id of ['corridor', 'landing', 'hall', 'server']) { const r = this.reg.rooms.get(id); if (r && x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]) return true; }
    return false;
  }

  interact() {
    const it = this.current; if (!it) return;
    const h = it.active(); if (h) h.use();
  }
}
