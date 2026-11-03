// 야간 평가실 — 브라우저판. 이야기·배치·소리·텍스처는 Unity 프로젝트와 같은 데이터.
import { THREE, D, mergeStatic, disposeTree, postMaterial, crtCurve } from './kit.js';
import { parseJsonc, localize, Vars, Story } from './story.js';
import { buildWorld, MatLib, buildCat, buildMonster } from './world.js';
import { Terminal, TERM_W, TERM_H } from './terminal.js';
import { AudioSys } from './audio.js';
import { t, setLang, getLang, applyDom } from './i18n.js';

const $ = (id) => document.getElementById(id);
const TEX = ['carpet', 'floor_tile', 'ceiling_tile', 'wall', 'desk_top', 'metal', 'plastic', 'fabric', 'cardboard', 'cat_fur', 'door',
  'keyboard', 'tower_front', 'notice', 'badge117', 'badge116', 'sticky', 'clock_face', 'sign_room', 'panel', 'calendar', 'elevator',
  'exit_sign', 'window_night', 'screen_117', 'screen_face', 'screen_cat', 'monster_skin',
  'notice_en', 'badge117_en', 'badge116_en', 'sticky_en', 'sign_room_en', 'panel_en', 'calendar_en', 'exit_sign_en', 'screen_117_en'];
const ENDING_COUNT = 6;
const EYE = 1.62, RADIUS = 0.3, WALK = 2.3, SPRINT = 4.9, REACH = 2.3;
const FOV = 62;
const CAT_SPEED = WALK / 4; // 겁쟁이 모드 고양이: 플레이어 걷기 속도의 1/4 (약 0.58 m/s)
const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PARK_Y = -60;
// 매 프레임 쓰는 임시 객체 (가비지 수집 멈춤 방지)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ'), _m1 = new THREE.Matrix4(), _c0 = new THREE.Vector2(0, 0), _sz = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);
const _aim = new THREE.Vector3();

// ---------- 저장 (이 브라우저에만) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ne_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ne_' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
};
const settings = {
  brightness: store.get('brightness', 0.5), master: store.get('master', 0.8), music: store.get('music', 0.7), sens: store.get('sens', 0.45),
  lang: store.get('lang', /^ko/i.test(navigator.language || 'ko') ? 'ko' : 'en'),
  chicken: !!store.get('chicken', false),
};
const saveSettings = () => { for (const k of Object.keys(settings)) store.set(k, settings[k]); };
const endingsFound = () => { let n = 0; for (let i = 1; i <= ENDING_COUNT; i++) if (store.get('end_' + i, 0)) n++; return n; };

// ---------- 전역 ----------
const app = {
  renderer: null, camera: null, rt: null, postMat: null, postScene: null, postCam: null,
  rawStory: null, dictEn: null, story: null, layoutJson: null, textures: new Map(), audio: new AudioSys(), session: null,
  phase: 'loading', paused: false, chaseSnapshot: null, clock: new THREE.Clock(), time: 0, locked: false, maxDt: 0.05, fps: 0, noAdapt: false,
};
// 화면 해상도 자동 조절: 느리면 MSAA 를 끄고 해상도를 낮춘다
const Q = { base: 1, scale: 1, acc: 0, frames: 0, settle: 4, up: 0 };

// ---------- 시작 ----------
async function boot() {
  setLang(settings.lang); applyDom(); document.title = t('gameTitle');
  const bar = $('loadbar');
  const progress = (p) => { bar.style.width = Math.round(p * 100) + '%'; };
  try {
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
    const [storyText, layoutText, langText] = await Promise.all([get('data/story.json'), get('data/office_layout.json'), get('data/lang_en.json').catch(() => '{}')]);
    app.rawStory = parseJsonc(storyText);
    app.layoutJson = parseJsonc(layoutText);
    app.dictEn = JSON.parse(langText);
    makeStory();
    await loadFonts();
    progress(0.1);
    const loader = new THREE.TextureLoader();
    await Promise.all(TEX.map((n) => new Promise((res) => loader.load(`tex/${n}.png`, (tx) => { app.textures.set(n, tx); res(); }, undefined, () => { console.warn('텍스처 실패', n); res(); }))));
    // 깜짝 장면 그림은 미리 풀어 둔다 (처음 뜰 때 멈칫하지 않게)
    await Promise.all([...document.querySelectorAll('#jumpscare img')].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
    progress(0.3);
    await app.audio.load('audio', (p) => progress(0.3 + p * 0.65));
    try { app.audio.makePanner(1, 1, true); } catch (e) { /* 입체 음향(HRTF) 미리 준비 — 없으면 일반 패닝 */ }
    setupRenderer();
    newSession(null);
    progress(1);
    $('loading').hidden = true;
    $('gate').hidden = false;
    app.phase = 'gate';
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    $('loadmsg').textContent = t('loadFail') + e.message;
  }
}

function makeStory() { app.story = new Story(getLang() === 'en' ? localize(app.rawStory, app.dictEn) : app.rawStory); }

async function loadFonts() {
  for (const [fam, file] of [['Galmuri11', 'fonts/Galmuri11.woff2'], ['Galmuri11B', 'fonts/Galmuri11-Bold.woff2']]) {
    try {
      const buf = await fetch(file).then((r) => r.arrayBuffer());
      const ff = new FontFace(fam, buf);
      await ff.load();
      document.fonts.add(ff);
    } catch (e) { console.warn('폰트 실패', fam, e); }
  }
}

function setupRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  Q.base = Math.min(window.devicePixelRatio || 1, 1.25);
  r.setPixelRatio(Q.base * Q.scale);
  r.setSize(window.innerWidth, window.innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  // 그림자는 무언가 움직일 때만 다시 그린다
  r.shadowMap.autoUpdate = false;
  r.shadowMap.needsUpdate = true;
  r.outputColorSpace = THREE.SRGBColorSpace;
  $('view').appendChild(r.domElement);
  app.renderer = r;
  r.getDrawingBufferSize(_sz);
  app.rt = new THREE.WebGLRenderTarget(_sz.x, _sz.y, { type: THREE.HalfFloatType, samples: 4 });
  app.postMat = postMaterial(app.rt.texture);
  app.postScene = new THREE.Scene();
  app.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), app.postMat));
  app.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  app.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 60);
  window.addEventListener('resize', onResize);
  bindInput();
}

function onResize() {
  const r = app.renderer;
  r.setSize(window.innerWidth, window.innerHeight);
  r.getDrawingBufferSize(_sz);
  app.rt.setSize(_sz.x, _sz.y);
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
}

function adaptQuality(dt) {
  const active = (app.phase === 'play' || app.phase === 'title') && !app.paused && !document.hidden && !app.noAdapt;
  if (!active) { Q.acc = 0; Q.frames = 0; return; }
  if (Q.settle > 0) { Q.settle -= dt; return; }
  Q.acc += dt; Q.frames++;
  if (Q.acc < 2.5) return;
  const fps = Q.frames / Q.acc;
  app.fps = fps; Q.acc = 0; Q.frames = 0;
  if (fps < 45) {
    Q.up = 0;
    if (app.rt.samples > 0) { app.rt.samples = 0; app.rt.dispose(); }
    else if (Q.scale > 0.56) { Q.scale = Math.max(0.55, Q.scale - 0.15); applyScale(); }
    Q.settle = 1;
  } else if (fps > 56 && Q.scale < 1) {
    if (++Q.up >= 3) { Q.up = 0; Q.scale = Math.min(1, Q.scale + 0.15); applyScale(); Q.settle = 1; }
  } else Q.up = 0;
}
function applyScale() { app.renderer.setPixelRatio(Q.base * Q.scale); onResize(); }

// ---------- 괴물 움직임 (관절 흔들기) ----------
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
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------- 세션 (처음부터 다시 = 통째로 새로 만든다) ----------
class Session {
  constructor(vars) {
    this.alive = true;
    this.vars = vars ? vars.clone() : new Vars();
    if (!this.vars.get('clock')) this.vars.set('clock', '00:41');
    this.timers = []; this.waiters = []; this.elapsed = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03060b);
    scene.fog = new THREE.FogExp2(0x03060b, 0.075);
    this.scene = scene;
    this.amb = new THREE.AmbientLight(0xffffff, 1);
    scene.add(this.amb);
    this.mats = new MatLib(app.textures, getLang());
    this.reg = buildWorld(app.layoutJson, this.mats, scene);
    mergeStatic(this.reg.root, scene);
    // 쫓아오는 것(괴물·고양이)은 처음부터 만들어 바닥 아래에 둔다 → 조명·셰이더 수가 고정되어 등장 순간에 렉이 없다
    this.faceTex = this.mats.tex('screen_face', 0, false);
    this.catTex = this.mats.tex('screen_cat', 0, false);
    this.monster = buildMonster(this.mats, scene, this.faceTex);
    this.cat = buildCat(this.mats, scene, 0, 0);
    this.monLight = new THREE.PointLight(0xa8c4ff, 0, 6, 1.6);
    scene.add(this.monLight);
    // 어둠 속에서도 괴물 실루엣이 읽히도록 아주 약한 자체 발광 (값만 바뀌어 셰이더는 그대로)
    this.mats.get('monster_skin').emissive?.setRGB(0.05, 0.055, 0.07);
    this.mats.get('monster_bone').emissive?.setRGB(0.04, 0.04, 0.045);
    app.camera.fov = FOV; app.camera.updateProjectionMatrix();
    this.vis = null; this.visLoops = [];
    this.parkChasers();
    this.term = new Terminal(this.reg.live, this.reg.crtLight, this.reg.crtGlow, (n, v) => this.termSfx(n, v));
    this.term.setHeader(t('termTitle') + ' v2.3', '', this.vars.get('clock'));
    this.term.showCenter(t('termTitle'), t('termIdle'));
    // 플레이어
    const sp = this.reg.spawn;
    this.p = { pos: new THREE.Vector3(sp.x, 0, -sp.z), yaw: -sp.yaw * D, pitch: 0, move: false, look: false, sprint: false, stepAcc: 0.5, bob: 0, bobY: 0, moving: false };
    this.seat = { seated: false, trans: 0, dir: 0, from: null, toPos: new THREE.Vector3(), toQuat: new THREE.Quaternion(), breathe: 0 };
    this.seatView = this.computeSeatView();
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.current = null;
    this.loops = new Map();
    this.chase = null;
    this.tension = 0;
    this.fogBase = 0.075;
    this.fog = { from: 0.075, to: 0.075, t: 1, dur: 1 };
    this.extBase = 1; this.flickerT = 0; this.flickT = 0; this.flickV = 1;
    // 추격 시작 장면(카메라 연출): 조작 잠금, 바라볼 곳, 시야각, 괴물 얼굴 빛 세기
    this.cineLock = false; this.lookAim = null; this.fovTarget = FOV; this.monGlow = 1.2; this.pendingHint = null;
    this.scareTok = 0; this.scareBusy = false; this.rattle = null; this.shadowAcc = 0;
    this.setupFeed();
    this.setupInteractions();
    this.startAmbient();
    this.applyChicken(settings.chicken);
    this.warm();
  }

  dispose() {
    this.alive = false;
    this.scareTok++;
    app.audio.stopAllLoops();
    disposeTree(this.scene);
    for (const m of this.mats.cache.values()) m.dispose();
    for (const tx of this.mats.made) tx.dispose();
    this.feed?.rt.dispose();
    this.term.tex.dispose();
  }

  /** 첫 화면 전에 셰이더를 모두 만들어 둔다 (처음 보는 물체가 나올 때의 멈칫 방지) */
  warm() {
    const r = app.renderer;
    try {
      r.compile(this.scene, app.camera);
      if (this.feed) { r.setRenderTarget(this.feed.rt); r.render(this.scene, this.feed.cam); r.setRenderTarget(null); }
    } catch (e) { console.warn('셰이더 준비 실패', e); }
    r.shadowMap.needsUpdate = true;
  }

  // ---------- 겁쟁이 모드 ----------
  applyChicken(on) {
    this.chicken = !!on;
    for (const l of this.reg.ceiling) { l.minLevel = on ? 1 : 0; l.calm = !!on; l.apply(); }
    if (on) this.amb.color.setRGB(0.3, 0.31, 0.34); else this.amb.color.setRGB(0.05, 0.06, 0.085);
    this.fog.t = 1;
    this.scene.fog.density = on ? 0.02 : this.fogBase;
    app.audio.setChicken(on);
  }

  termSfx(name, vol) {
    const s = this.reg.live; if (!s) return;
    s.getWorldPosition(_v1);
    app.audio.playAt(name, _v1, vol, 9, 0.05);
  }

  sleep(s) { return new Promise((r) => this.timers.push({ t: s, r })); }
  until(pred) { return new Promise((r) => this.waiters.push({ pred, r })); }
  waitSeated() { return this.until(() => this.seat.seated); }

  computeSeatView() {
    const s = this.reg.live;
    s.updateWorldMatrix(true, false);
    const sp = new THREE.Vector3(); s.getWorldPosition(sp);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(s.matrixWorld);
    const dist = (0.27 / 0.8) / (2 * Math.tan((62 * D) / 2));
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
    this.seat.seated = false; this.term.acceptInput = false; this.term.pointer(null);
    if (instant) { this.seat.dir = 0; this.finishStand(); return; }
    this.seat.from = { pos: app.camera.position.clone(), quat: app.camera.quaternion.clone() };
    this.seat.dir = -1; this.seat.trans = 0;
  }
  finishStand() {
    this.reg.avatar.userData.isSeated = false;
    // 추격 시작 장면 중에는 조작을 돌려주지 않는다
    if (app.phase === 'play' && !this.cineLock) { this.p.move = this.p.look = true; setCrosshair(true); }
  }

  // ---------- 상호작용 기본값 (Unity EnvironmentDirector 와 동일) ----------
  setupInteractions() {
    const reg = this.reg, story = app.story, v = this.vars;
    const key = (id) => (id.startsWith('Window') ? 'window' : id.startsWith('crt_') ? 'dead_pc' : /^D\d\d$/.test(id) ? 'desk' : id);
    for (const [id, it] of reg.its) {
      if (reg.doors.has(id) || id === 'Computer') continue;
      const k = key(id);
      if (!story.inspects.has(k)) continue;
      it.add(t('pExamine'), () => true, () => this.inspect(k), 0, this);
    }
    reg.its.get('Computer')?.add(t('pUse'), () => app.phase === 'play' && !this.seat.seated && !this.seat.dir, () => this.sit(), 0, this);
    for (const [id, door] of reg.doors) {
      const it = reg.its.get(id); if (!it) continue;
      it.add(t('pTryDoor'), () => door.locked && !(id === 'ExitDoor' && v.truthy('chase')), () => {
        app.audio.playAt('sfx_door_locked', this.anchorPos(id), 0.6, 10); this.inspect(id + '_locked');
      }, 1, this);
      if (id === 'FrontDoor') {
        it.add(t('pLeave'), () => !door.locked && !v.truthy('final') && !v.truthy('chase') && app.phase === 'play', () => askLeave(), 2, this);
      } else if (id === 'BackDoor') {
        it.add(t('pOpen'), () => !door.locked && door.amount < 0.5 && !door.busy, () => {
          door.setOpen(1, 1.4); app.audio.playAt('sfx_door_open', this.anchorPos(id), 0.7, 14); v.set('back_ajar', '1'); this.setDraft(0.35);
        }, 2, this);
        it.add(t('pClose'), () => !door.locked && door.amount >= 0.5 && !door.busy && !v.truthy('chase'), () => {
          door.setOpen(0, 1.2); app.audio.playAt('sfx_door_close', this.anchorPos(id), 0.7, 14); v.remove('back_ajar'); this.setDraft(0);
        }, 2, this);
      }
    }
  }

  inspect(id) { const lines = app.story.inspectLines(id, this.vars); if (lines.length) monologue(lines); }
  anchorPos(id) { const a = this.reg.anchors.get(id); const v = new THREE.Vector3(); if (a) a.getWorldPosition(v); else v.copy(this.p.pos).setY(1.2); return v; }

  startAmbient() {
    const A = app.audio, reg = this.reg;
    const pc = reg.anchors.get('PlayerDesk');
    if (pc) this.loops.set('fan', A.loop3D('amb_fan', pc, 0.3, 0.5, 7));
    if (reg.live) this.loops.set('crt', A.loop3D('amb_crt', reg.live, 0.16, 0.3, 4));
    const cor = reg.anchors.get('Corridor');
    if (cor) this.loops.set('draft', A.loop3D('amb_draft', cor, 0, 1, 9));
  }
  setDraft(v) { app.audio.setLoopVol(this.loops.get('draft'), v); }

  // ---------- 이벤트 (story.json events) ----------
  fire(id) {
    const actions = app.story.events.get(id);
    if (!actions) { console.warn('정의되지 않은 이벤트', id); return; }
    this.runEvent(id, actions).catch((e) => console.error('이벤트 오류', id, e));
  }
  async runEvent(id, actions) {
    for (const a of actions) {
      if (!this.alive) return;
      if (a.do === 'wait') { await this.sleep(a.s ?? 1); continue; }
      if (a.do === 'monitors') { await this.monitors(a); continue; }
      // 추격 시작(burst)은 끝날 때까지 기다린 뒤 다음 동작으로 (문이 열리는 순서 유지)
      if (a.do === 'scare') { const p = this.scare(a); if (a.kind === 'burst') await p; continue; }
      try { this.act(a); } catch (e) { console.error('동작 오류', id, a.do, e); }
    }
  }
  act(a) {
    const reg = this.reg, v = this.vars, A = app.audio, tg = a.target || '';
    switch (a.do) {
      case 'set': v.apply(a.value || ''); break;
      case 'door': { const d = reg.doors.get(tg); if (!d) break; if ('locked' in a) d.setLocked(!!a.locked); if ('open' in a) d.setOpen(a.open, a.time ?? 1.5); break; }
      case 'drawer': { const dr = reg.drawers.get(tg); if (dr) dr.open = true; break; }
      case 'light': for (const l of this.lights(tg)) l.fadeTo(a.level ?? 1, a.time ?? 1); break;
      case 'flicker': for (const l of this.lights(tg)) l.flicker = a.on ?? true; break;
      case 'hum': A.setHum(a.on ?? true, a.time ?? 1); A.setLoopVol(this.loops.get('fan'), (a.on ?? true) ? 0.3 : 0); break;
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
        if (a.ring ?? true) { A.fadeLoop(this.loops.get('phone'), 0.1); this.loops.set('phone', A.loop3D('sfx_phone', reg.anchors.get('Phone'), 0.55, 1, 16)); }
        else { A.fadeLoop(this.loops.get('phone'), 0.3); this.loops.delete('phone'); }
        break;
      case 'checkpoint': this.checkpoint(a); break;
      case 'hint':
        // 카메라 연출 중에 "달려!" 안내가 먼저 뜨지 않도록, 조작을 돌려줄 때 보여 준다
        if (this.cineLock) this.pendingHint = v.format(a.text || ''); else setObjective(v.format(a.text || ''));
        break;
      case 'caption': caption(v.format(a.text || '')); break;
      case 'monologue': if (a.inspect) this.inspect(a.inspect); else monologue([v.format(a.text || '')]); break;
      case 'tension': { const lv = a.level | 0; A.setTension(lv); this.term.tension = lv; this.tension = lv; v.set('tension', lv); break; }
      case 'fog':
        // 겁쟁이 모드에서는 안개가 짙어지지 않는다 (값은 기억해 두었다가 모드를 끄면 적용)
        this.fogBase = a.density ?? 0.08;
        if (!this.chicken) this.fog = { from: this.scene.fog.density, to: this.fogBase, t: 0, dur: Math.max(0.01, a.time ?? 3) };
        break;
      case 'music': A.setMusic(a.track || 'game'); break;
      case 'standup': this.stand(false); break;
      case 'draft': this.setDraft(a.volume ?? 0.3); break;
      default: console.warn('알 수 없는 동작', a.do);
    }
  }
  lights(group) {
    if (group === 'all') return this.reg.ceiling;
    return this.reg.lights.get(group) || [];
  }
  anchorObj(at) { if (!at || at === 'player') return this.playerObj || (this.playerObj = new THREE.Object3D()); return this.reg.anchors.get(at) || this.playerObj; }
  resolvePos(at) {
    const p = this.p, fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    if (at === 'player') return p.pos.clone().setY(1.2);
    if (at === 'behind') return p.pos.clone().addScaledVector(fwd, -3.2).setY(1.2);
    if (at === 'above') return p.pos.clone().setY(2.4);
    return this.anchorPos(at);
  }

  setupFeed() {
    const c = this.reg.cctv; if (!c) return;
    const rt = new THREE.WebGLRenderTarget(320, 240);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(78, 4 / 3, 0.1, 30);
    cam.rotation.y = Math.PI; // 머리의 +z(렌즈) 방향을 본다
    cam.position.z = 0.15;
    c.head.add(cam);
    cam.layers.enable(1);
    this.feed = { rt, cam, t: 0, on: false };
  }

  cctv(a) {
    const c = this.reg.cctv; if (!c) return;
    if ('led' in a) c.led.material = a.led ? c.ledOn : c.ledOff;
    if ('track' in a) c.tracking = !!a.track;
    if (a.feed && this.feed) {
      this.feed.on = true;
      this.reg.cctvMonitor.turnOn(this.feed.rt.texture, [0.75, 0.95, 0.85], 1.6, 0.5);
      this.vars.set('cctv_on', '1');
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
      else { m.turnOn(tex, [0.75, 0.9, 1.0], 1.2, 0.35); app.audio.playAt('sfx_crt_on', wp(m).add(new THREE.Vector3(0, 0.2, 0)), 0.35, 14, 0.08); }
      await this.sleep(a.interval ?? 0.6);
    }
    if (a.mode !== 'off') this.vars.set('monitors_on', '1');
  }

  checkpoint(a) {
    const v = this.vars, flag = a.flag || '', created = this.elapsed;
    const pattern = a.target || '';
    const targets = [];
    for (const [id, it] of this.reg.its) if (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern) targets.push(it);
    if (!targets.length) { console.warn('확인 지점 대상 없음', pattern); v.set(flag, '1'); return; }
    const owner = {};
    for (const it of targets) {
      it.add(a.prompt || t('pCheck'), () => !v.truthy(flag), () => {
        if (v.truthy(flag)) return;
        v.set(flag, '1');
        if (a.place) v.set('last_place', a.place);
        if (a.timer) v.set(a.timer, Math.max(1, Math.round(this.elapsed - created)));
        for (const t2 of targets) t2.removeOwner(owner);
        this.inspect(a.inspect || '');
        app.audio.play2D('sfx_check', 0.25);
        if (a.then) this.fire(a.then);
      }, 100, owner);
    }
  }

  // ---------- 깜짝 장면 ----------
  // 모든 깜짝 장면은 3초 예고 뒤에 일어난다. 일반 모드: 소리가 잦아든다(정적). 겁쟁이 모드: 오른쪽 아래 카운트다운 + 고양이.
  async scare(a) {
    const kind = a.kind || 'glimpse';
    if (this.scareBusy) {
      // 추격 시작은 진행 중인 것을 끊고 바로, 나머지는 앞의 것이 끝난 뒤에 차례로
      if (kind === 'burst') this.cancelScare();
      else { await this.until(() => !this.scareBusy); if (!this.alive) return; }
    }
    const tok = ++this.scareTok;
    const ok = () => this.alive && tok === this.scareTok;
    this.scareBusy = true;
    // 추격 시작: 입구 문 잠금이 풀리는 소리 → 카메라가 천천히 입구 문을 보며 조금씩 확대 (예고 3초)
    if (kind === 'burst' && this.cineLock) { const fd = this.anchorPos('FrontDoor'); this.lookAim = { get: () => fd, k: 2.5 }; this.fovTarget = 54; }
    try {
      if (this.chicken) {
        for (let n = 3; n > 0; n--) {
          if (!ok()) return;
          countdown(n); app.audio.play2D('sfx_tick', 0.4);
          await this.sleep(1);
        }
        countdown(null);
      } else {
        app.audio.duck(true);
        await this.sleep(3);
      }
      if (!ok()) return;
      const fn = { glimpse: this.scareGlimpse, cctv: this.scareCctv, door: this.scareDoor, monitor: this.scareMonitor, burst: this.scareBurst }[kind];
      if (fn) await fn.call(this, a, ok);
    } catch (e) {
      console.error('깜짝 장면 오류', kind, e);
    } finally {
      if (tok === this.scareTok) {
        this.scareBusy = false;
        countdown(null);
        app.audio.duck(false);
        if (kind !== 'burst') { this.hideVisual(); this.extBase = 1; }
      }
    }
  }
  cancelScare() {
    this.scareTok++;
    this.scareBusy = false;
    countdown(null);
    app.audio.duck(false);
    hideJumpscare();
    this.hideVisual();
    this.extBase = 1; this.flickerT = 0;
  }

  /** 플레이어 기준 방향(base)·각도·거리 후보 중, 서 있을 수 있고 플레이어와 사이에 벽·닫힌 문이 없는 자리 */
  findSpot(base, dists, angles) {
    const p = this.p, grid = this.reg.grid;
    for (const a of angles) {
      for (const d of dists) {
        const yaw = p.yaw + base + a;
        const x = p.pos.x - Math.sin(yaw) * d, z = p.pos.z - Math.cos(yaw) * d;
        if (!grid.circleFree(x, -z, 0.35)) continue;
        if (!grid.lineFree(p.pos.x, -p.pos.z, x, -z, 0.05)) continue;
        return { pos: new THREE.Vector3(x, 0, z), yaw: Math.atan2(-(p.pos.x - x), -(p.pos.z - z)) };
      }
    }
    return null;
  }
  looksAt(pos, cosMin) {
    const cam = app.camera;
    cam.getWorldDirection(_v1);
    _v2.copy(pos).setY(this.chicken ? 0.5 : 1.7).sub(cam.position).normalize();
    return _v1.dot(_v2) > cosMin;
  }

  showVisual(pos, yaw) { this.vis = { pos: pos.clone(), yaw }; this.poseChaser(this.vis.pos, yaw, 0, 0); app.renderer.shadowMap.needsUpdate = true; }
  hideVisual() {
    this.vis = null;
    for (const lp of this.visLoops) app.audio.fadeLoop(lp, 0.25);
    this.visLoops = [];
    if (!this.chase || !this.chase.shown) this.parkChasers();
    app.renderer.shadowMap.needsUpdate = true;
  }
  parkChasers() {
    this.monster.root.position.set(0, PARK_Y, 0);
    this.cat.root.position.set(3, PARK_Y, 0);
    this.monLight.intensity = 0; this.monLight.position.set(0, PARK_Y + 2, 0);
  }
  /** 쫓아오는 것을 pos 에 세운다. 겁쟁이 모드면 고양이, 아니면 괴물. 괴물 발걸음 순간이면 true */
  poseChaser(pos, yaw, speed, dt) {
    const m = this.monster, c = this.cat;
    if (this.chicken) {
      m.root.position.set(0, PARK_Y, 0);
      this.monLight.intensity = 0; this.monLight.position.set(0, PARK_Y + 2, 0);
      c.root.position.copy(pos); c.root.rotation.y = yaw;
      c.visual.rotation.y += 820 * D * dt;
      c.visual.position.y = Math.abs(Math.sin(app.time * 9)) * 0.06;
      return false;
    }
    c.root.position.set(3, PARK_Y, 0);
    m.root.position.copy(pos); m.root.rotation.y = yaw;
    const stepped = animMonster(m, dt, speed);
    // 얼굴 화면이 내는 희미한 빛
    this.monLight.position.set(pos.x - Math.sin(yaw) * 0.5, 1.9, pos.z - Math.cos(yaw) * 0.5);
    this.monLight.intensity = this.monGlow;
    return stepped;
  }
  lightsOut(on) { this.extBase = on ? 0 : 1; }

  async scareGlimpse(a, ok) {
    const A = app.audio;
    const spot = this.findSpot(0, [5.5, 4.5, 6.5, 3.8, 7.5, 3], [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2, Math.PI]);
    if (this.chicken) {
      if (spot) { this.showVisual(spot.pos, spot.yaw); A.playAt('sfx_cat', _v1.copy(spot.pos).setY(0.6), 0.7, 14); }
      A.play2D('sfx_boing', 0.6);
      await this.sleep(1.8);
      this.hideVisual(); A.play2D('sfx_boing', 0.4, false, 1.3);
      return;
    }
    this.lightsOut(true);
    A.playAt('sfx_static_2', this.resolvePos('above'), 0.5, 10);
    await this.sleep(0.45); if (!ok()) return;
    if (spot) this.showVisual(spot.pos, spot.yaw);
    this.lightsOut(false); this.flickerT = 1.4;
    A.duck(false);
    A.play2D('js_stinger', 0.85);
    if (spot) A.playAt('mon_step_2', spot.pos, 0.8, 18);
    flash(0.3);
    await this.sleep(1.15); if (!ok()) return;
    this.lightsOut(true);
    A.playAt('sfx_static_1', this.resolvePos('above'), 0.4, 10);
    await this.sleep(0.3);
    this.hideVisual();
    this.lightsOut(false);
  }

  async scareCctv(a, ok) {
    const A = app.audio;
    const spot = this.findSpot(Math.PI, [1.4, 1.1, 1.8, 2.3], [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]);
    if (!spot) { A.playAt(this.chicken ? 'sfx_cat' : 'mon_breath', this.resolvePos('behind'), 0.7, 8); await this.sleep(2); return; }
    this.showVisual(spot.pos, spot.yaw);
    if (this.chicken) this.visLoops.push(A.loop3D('sfx_cat', this.cat.root, 0.6, 1, 12));
    else { this.visLoops.push(A.loop3D('mon_breath', this.monster.P.head, 0.9, 0.6, 9, true)); A.play2D('js_stinger', 0.3); }
    // 뒤돌아보면 사라진다. 6.5초 동안 돌아보지 않으면 조용히 사라진다.
    const t0 = this.elapsed;
    while (ok() && this.elapsed - t0 < 6.5) {
      await this.sleep(0.05);
      if (!this.looksAt(spot.pos, 0.78)) continue;
      if (this.chicken) { A.play2D('sfx_boing', 0.7); await this.sleep(0.6); }
      else {
        this.lightsOut(true);
        A.play2D('js_shriek', 0.75); flash(0.6); shake(0.06, 0.5);
        await this.sleep(0.2);
      }
      break;
    }
    this.hideVisual();
    this.lightsOut(false);
  }

  async scareDoor(a, ok) {
    const A = app.audio, id = a.target || 'FrontDoor', pos = this.anchorPos(id), door = this.reg.doors.get(id);
    A.playAt('sfx_door_bang', pos, this.chicken ? 0.45 : 1.0, 20, 0.02);
    if (door) this.rattle = { door, t: 0.7, amp: this.chicken ? 0.01 : 0.035 };
    if (!this.chicken) shake(0.025, 0.35);
    await this.sleep(this.chicken ? 0.5 : 0.22); if (!ok()) return;
    this.jumpscareFx(this.chicken ? 1.4 : 0.95);
    await this.sleep(this.chicken ? 1.4 : 1.0);
  }

  async scareMonitor(a, ok) {
    const A = app.audio;
    let best = null, bd = 1e9;
    for (const m of this.reg.dead) { m.mesh.getWorldPosition(_v1); const d = _v1.distanceToSquared(this.p.pos); if (d < bd) { bd = d; best = m; } }
    if (best) {
      const wasOn = best.isOn, prev = best.live ? best.live.uniforms.map.value : null;
      best.turnOn(this.chicken ? this.catTex : this.faceTex, this.chicken ? [1, 0.95, 1] : [1, 0.85, 0.85], 1.5, 0.08);
      best.mesh.getWorldPosition(_v1);
      A.playAt(this.chicken ? 'sfx_boing' : 'sfx_static_3', _v1, 0.8, 12);
      await this.sleep(0.7);
      if (ok()) { this.jumpscareFx(this.chicken ? 1.4 : 0.95); await this.sleep(this.chicken ? 1.4 : 1.0); }
      if (wasOn && prev) best.live.uniforms.map.value = prev; else best.turnOff(0.3);
    } else { this.jumpscareFx(this.chicken ? 1.4 : 0.95); await this.sleep(1.0); }
  }

  /** 전체 화면 얼굴 (겁쟁이 모드: 고양이) */
  jumpscareFx(dur) {
    const A = app.audio;
    jumpscare(this.chicken, dur);
    if (this.chicken) { A.play2D('sfx_boing', 0.7); A.play2D('sfx_cat', 0.45); }
    else { A.duck(false); A.play2D('js_shriek', 0.9); flash(0.5); shake(0.05, 0.6); }
  }

  /** 추격 시작: 입구 문이 터지듯 열리고 그것이 들어온다.
   *  카메라가 그것을 따라가며 확대해 위치를 보여 준 뒤, 도망칠 곳(뒤쪽 문)으로 돌아가고 나서 조작을 돌려준다. */
  async scareBurst(a, ok) {
    const A = app.audio, door = this.reg.doors.get('FrontDoor'), dpos = this.anchorPos('FrontDoor');
    const ch = this.chase;
    // 그것이 설 자리: 입구 문 바로 안쪽 (자리에서 잘 보이는 곳)
    const stage = new THREE.Vector3(dpos.x, 0, dpos.z - 0.65);
    if (door) { door.setLocked(false); door.setOpen(1, this.chicken ? 0.6 : 0.2); }
    A.duck(false);
    if (this.chicken) {
      A.playAt('sfx_boing', dpos, 0.8, 18);
      // 고양이는 문간에 '뿅' 하고 나타난다
      if (ch && !ch.done) { ch.pos.copy(stage); ch.trail = [[stage.x, -stage.z], [this.p.pos.x, -this.p.pos.z]]; ch.shown = true; }
    } else {
      A.playAt('sfx_door_bang', dpos, 1.0, 22); A.playAt('mon_roar', dpos, 1.0, 26);
      flash(0.45); shake(0.035, 0.5); this.flickerT = 0.35;
      for (const l of this.lights('hall')) l.fadeTo(1.1, 0.1); // 문 뒤 복도 등이 켜져 실루엣이 드러난다
      if (ch && !ch.done) { ch.shown = true; ch.intro = stage; } // 복도에서 문간까지 걸어 들어온다
    }
    if (!ch || ch.done) return;
    if (this.cineLock) {
      const h = this.chicken ? 0.45 : 1.55;
      this.monGlow = this.chicken ? 0 : 2.0;
      this.lookAim = { get: () => _aim.set(ch.pos.x, h, ch.pos.z), k: 7 };
      this.fovTarget = this.chicken ? 34 : 44;
      await this.until(() => !ch.intro || ch.done || !this.alive);
      if (!this.chicken) { _v1.set(ch.pos.x, 2.1, ch.pos.z); A.playAt('sfx_static_3', _v1, 0.7, 14); }
      await this.sleep(this.chicken ? 1.6 : 1.4);
      if (ch.done || !this.alive) return;
      const back = this.anchorPos('BackDoor');
      this.fovTarget = FOV;
      this.lookAim = { get: () => back, k: 4 };
      this.monGlow = 1.2;
      await this.sleep(0.9);
      this.endChaseIntro();
      await this.sleep(this.chicken ? 0.2 : 1.2);
    }
    if (!ch.done) ch.released = true;
  }
  /** 카메라 연출을 끝내고 조작을 돌려준다 */
  endChaseIntro() {
    const had = this.cineLock;
    this.cineLock = false; this.lookAim = null; this.fovTarget = FOV; this.monGlow = 1.2;
    if (!had) return;
    if (this.pendingHint) { setObjective(this.pendingHint); this.pendingHint = null; }
    if (app.phase === 'play' && !this.seat.seated && !this.seat.dir) { this.p.move = this.p.look = true; setCrosshair(true); }
  }
  resetCine() { this.cineLock = false; this.lookAim = null; this.fovTarget = FOV; this.pendingHint = null; this.monGlow = 1.2; }

  // ---------- 이야기 진행 ----------
  async runStory(id) {
    const st = app.story, v = this.vars, term = this.term;
    let guard = 0;
    while (id && this.alive) {
      if (++guard > 500) { console.error('이야기 순환?'); return; }
      const node = st.nodes.get(id);
      if (!node) { console.error('노드 없음', id); return; }
      if (node.chase) app.chaseSnapshot = v.clone();
      for (const op of node.set) v.apply(op);
      const lines = st.visibleLines(node.lines, v);
      if (node.clear && lines.length) await this.waitSeated();
      if (node.clear) term.clearBody();
      if (node.record != null) term.setHeader(v.format(node.record), v.format(node.status ?? ''), v.get('clock'));
      else term.setClock(v.get('clock'));
      for (const ev of node.onEnter) this.fire(ev);
      for (const line of lines) {
        await this.waitSeated();
        await term.showLine(line.who, v.format(line.text), line.glitch);
        if (line.pause > 0) await this.sleep(line.pause);
      }
      for (const ev of node.after) this.fire(ev);
      if (node.ending) { await this.sleep(1.2); triggerEnding(node.ending); return; }
      if (node.chase) {
        const escaped = await this.runChase();
        id = escaped ? node.chase.escaped : node.chase.caught;
        continue;
      }
      const choices = st.visibleChoices(node, v);
      if (choices.length) {
        await this.waitSeated();
        const i = await term.showChoices(choices.map((c) => v.format(c.text)), choices.map((c) => c.unsettling));
        const ch = choices[i];
        for (const op of ch.set) v.apply(op);
        for (const ev of ch.events) this.fire(ev);
        id = ch.next;
        continue;
      }
      if (node.wait && node.wait.flag && !v.truthy(node.wait.flag)) {
        term.clearBody();
        term.showCenter(node.wait.screen ? v.format(node.wait.screen) : t('termWait'), '· · ·');
        const hint = v.format(node.wait.hint || '');
        if (hint) setObjective(hint);
        const start = this.elapsed;
        let reminded = false;
        await this.until(() => {
          const w = this.elapsed - start;
          if (!reminded && w > 90 && hint) { reminded = true; setObjective(hint + t('remind')); }
          if (w > 240) v.set(node.wait.flag, '1');
          return v.truthy(node.wait.flag);
        });
        setObjective(null);
        term.showCenter(t('termNew'), t('termSit'));
        this.termSfx('sfx_beep_new', 0.6);
        if (!this.seat.seated) {
          await this.sleep(2.2);
          if (!this.seat.seated) setObjective(t('backToDesk'));
        }
        await this.waitSeated();
        setObjective(null);
      }
      id = st.resolveNext(node, v);
    }
  }

  // ---------- 추격 ----------
  runChase() {
    return new Promise((resolve) => {
      const spawn = this.anchorPos('CatSpawn');
      const door = this.anchorPos('FrontDoor');
      const ux = door.x, uz = -door.z; // 배치(Unity) 좌표
      const ch = {
        pos: new THREE.Vector3(spawn.x, 0, spawn.z),
        yaw: Math.atan2(-(this.p.pos.x - spawn.x), -(this.p.pos.z - spawn.z)),
        trail: [[ux, uz - 0.3], [ux, uz + 0.8], [this.p.pos.x, -this.p.pos.z]],
        exit: this.anchorPos('ExitPoint'),
        shown: false, released: false, intro: null, fallback: 14, t: 0, speed: 0, done: false, resolve, loops: null, audioMode: null, stepN: 0,
        exitIt: this.reg.its.get('ExitDoor'),
      };
      ch.exitIt?.add(t('pExit'), () => !ch.done, () => this.escape(ch), 50, ch);
      this.chase = ch;
      // 추격 시작 장면: 조작을 잠시 멈추고, 카메라로 도망칠 곳과 그것의 위치를 차례로 보여 준다
      this.cineLock = true;
      if (!this.seat.seated && !this.seat.dir) { this.p.move = this.p.look = false; setCrosshair(false); }
      this.until(() => !this.seat.seated && !this.seat.dir).then(() => {
        if (ch.done || !this.cineLock || ch.shown) return;
        setCrosshair(false);
        const back = this.anchorPos('BackDoor');
        this.lookAim = { get: () => back, k: 3 }; // 열리는 뒤쪽 문 = 도망칠 곳
      });
    });
  }
  ensureChaseAudio(ch) {
    const mode = this.chicken ? 'cat' : 'monster';
    if (ch.audioMode === mode) return;
    this.stopChaseAudio(ch);
    const A = app.audio;
    ch.loops = mode === 'cat'
      ? [A.loop3D('sfx_cat', this.cat.root, 0.75, 1.5, 16)]
      : [A.loop3D('mon_breath', this.monster.P.head, 0.85, 0.8, 14, true), A.loop3D('mon_static', this.monster.P.head, 0.3, 0.6, 10), A.loop3D('mon_drag', this.monster.root, 0.45, 1, 13)];
    ch.audioMode = mode;
  }
  stopChaseAudio(ch) { for (const lp of ch.loops || []) if (lp) app.audio.fadeLoop(lp, 0.15); ch.loops = null; ch.audioMode = null; }

  escape(ch) {
    if (ch.done) return;
    ch.done = true;
    this.resetCine();
    this.p.move = this.p.look = false;
    this.stopChaseAudio(ch);
    ch.exitIt?.removeOwner(ch);
    if (this.scareBusy) this.cancelScare();
    this.reg.doors.get('ExitDoor')?.setOpen(1, 0.8);
    app.audio.playAt('sfx_door_open', this.anchorPos('ExitDoor'), 0.7, 10);
    this.parkChasers();
    this.chase = null;
    ch.resolve(true);
  }

  async caught(ch) {
    if (ch.done) return;
    ch.done = true;
    this.resetCine();
    this.p.move = this.p.look = false;
    setCrosshair(false); setObjective(null);
    ch.exitIt?.removeOwner(ch);
    const A = app.audio;
    if (this.chicken) {
      // 겁쟁이 모드: 잡힌 뒤에도 3초 카운트다운을 먼저 보여 준다 (고양이는 계속 돈다)
      this.vis = { pos: ch.pos.clone(), yaw: ch.yaw };
      for (let n = 3; n > 0; n--) {
        countdown(n); A.play2D('sfx_tick', 0.4);
        await this.sleep(1);
      }
      countdown(null);
      this.stopChaseAudio(ch);
      jumpscare(true, 1.6); A.play2D('sfx_boing', 0.8); A.play2D('sfx_cat', 0.6);
      await this.sleep(1.5);
    } else {
      this.stopChaseAudio(ch);
      A.silenceAll();
      jumpscare(false, 1.3); A.play2D('js_shriek', 1.0); A.play2D('mon_roar', 0.7); flash(0.8); shake(0.08, 0.9);
      await this.sleep(1.15);
    }
    setFade(1); hideJumpscare();
    A.silenceAll(); A.stopAllLoops();
    this.vis = null;
    this.parkChasers();
    this.chase = null;
    ch.resolve(false);
  }

  updateChase(dt) {
    const ch = this.chase; if (!ch || ch.done) return;
    const grid = this.reg.grid, p = this.p.pos;
    const pU0 = p.x, pU1 = -p.z;
    const last = ch.trail[ch.trail.length - 1];
    if (Math.hypot(pU0 - last[0], pU1 - last[1]) > 0.3) ch.trail.push([pU0, pU1]);
    if (Math.hypot(p.x - ch.exit.x, p.z - ch.exit.z) < 1.15) { this.escape(ch); return; }
    if (!ch.shown) {
      ch.fallback -= dt;
      if (ch.fallback > 0) return;
      ch.shown = true; ch.released = true; ch.intro = null; // 깜짝 장면이 취소된 경우의 예비
      this.endChaseIntro();
    }
    this.ensureChaseAudio(ch);
    const c = ch.pos;
    let speed = 0;
    if (ch.released) {
      ch.t += dt;
      const [s0, s1, ramp] = this.chicken ? [CAT_SPEED, CAT_SPEED, 1] : [2.6, 4.4, 9];
      ch.speed = s0 + (s1 - s0) * Math.min(1, ch.t / ramp);
      speed = this.chicken ? ch.speed : ch.speed * (0.8 + 0.3 * Math.abs(Math.sin(this.monster.phase)));
      const cU0 = c.x, cU1 = -c.z;
      let tx, tz;
      if (grid.lineFree(cU0, cU1, pU0, pU1, 0.22)) { tx = pU0; tz = pU1; ch.trail = [[pU0, pU1]]; }
      else {
        while (ch.trail.length > 1 && Math.hypot(ch.trail[0][0] - cU0, ch.trail[0][1] - cU1) < 0.3) ch.trail.shift();
        for (let i = Math.min(ch.trail.length - 1, 12); i > 0; i--) { if (grid.lineFree(cU0, cU1, ch.trail[i][0], ch.trail[i][1], 0.22)) { ch.trail.splice(0, i); break; } }
        [tx, tz] = ch.trail[0] || [pU0, pU1];
      }
      const dx = tx - cU0, dz = tz - cU1, dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        const st = Math.min(dist, speed * dt);
        c.x += (dx / dist) * st; c.z -= (dz / dist) * st;
        ch.yaw = lerpAngle(ch.yaw, Math.atan2(-dx, dz), Math.min(1, dt * 8));
      }
    } else if (ch.intro) {
      // 문간까지 걸어 들어온다 (카메라가 따라간다)
      const dx = ch.intro.x - c.x, dz = ch.intro.z - c.z, d = Math.hypot(dx, dz);
      if (d < 0.04) { ch.intro = null; ch.trail = [[c.x, -c.z], [pU0, pU1]]; }
      else {
        const st = Math.min(d, 2.0 * dt);
        c.x += (dx / d) * st; c.z += (dz / d) * st; speed = 2.0;
        ch.yaw = lerpAngle(ch.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 8));
      }
    } else ch.yaw = lerpAngle(ch.yaw, Math.atan2(-(p.x - c.x), -(p.z - c.z)), Math.min(1, dt * 6));
    if (this.poseChaser(c, ch.yaw, speed, dt)) app.audio.playAt('mon_step_' + (1 + (ch.stepN++ % 3)), c, 0.9, 24, 0.06);
    if (ch.released && Math.hypot(p.x - c.x, p.z - c.z) < 0.85) this.caught(ch);
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    this.elapsed += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.r(); } }
    for (let i = this.waiters.length - 1; i >= 0; i--) { const w = this.waiters[i]; if (w.pred()) { this.waiters.splice(i, 1); w.r(); } }
    const reg = this.reg;
    this.updateLights(dt);
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
    for (const dr of reg.drawers.values()) {
      const dz = dr.closedZ + (dr.open ? 0.28 : 0) - dr.obj.position.z;
      if (Math.abs(dz) > 1e-4) { dr.obj.position.z += Math.sign(dz) * Math.min(Math.abs(dz), dt * 0.4); shadow = true; }
    }
    if (this.fog.t < 1 && !this.chicken) { this.fog.t = Math.min(1, this.fog.t + dt / this.fog.dur); this.scene.fog.density = this.fog.from + (this.fog.to - this.fog.from) * this.fog.t; }
    this.updateClock(dt);
    this.updateCctv(dt);
    this.updatePlayer(dt);
    this.updateChase(dt);
    const cam = app.camera;
    if (Math.abs(cam.fov - this.fovTarget) > 0.02) { cam.fov += (this.fovTarget - cam.fov) * (1 - Math.exp(-3.5 * dt)); cam.updateProjectionMatrix(); }
    if (this.vis && !(this.chase && !this.chase.done && this.chase.shown)) this.poseChaser(this.vis.pos, this.vis.yaw, 0, dt);
    if (this.vis || (this.chase && this.chase.shown)) { this.shadowAcc += dt; if (this.shadowAcc >= 1 / 30) { this.shadowAcc = 0; shadow = true; } }
    if (shadow) app.renderer.shadowMap.needsUpdate = true;
    this.term.update(dt, app.time);
    this.updateAvatar();
    if (this.playerObj) this.playerObj.position.copy(this.p.pos).setY(1.2);
  }

  /** 천장등: 이야기 값 × 정전·깜빡임 연출 */
  updateLights(dt) {
    let ext = this.extBase;
    if (this.flickerT > 0) {
      this.flickerT -= dt; this.flickT -= dt;
      if (this.flickT <= 0) { this.flickT = 0.04 + Math.random() * 0.11; this.flickV = Math.random() < 0.45 ? 0.06 : 1; }
      ext *= this.chicken ? 1 : this.flickV;
    }
    for (const l of this.reg.ceiling) { l.ext = ext; l.update(dt); }
  }

  updateClock(dt) {
    const c = this.reg.clock; if (!c) return;
    c.drift += dt / 20;
    const [h, m] = (this.vars.get('clock') || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
    const mins = h * 60 + m + c.drift;
    c.minute.rotation.z = -((mins % 60) * 6) * D;
    c.hour.rotation.z = -(((mins / 60) % 12) * 30) * D;
  }

  updateCctv(dt) {
    const c = this.reg.cctv; if (!c) return;
    if (c.tracking) {
      _v1.copy(this.p.pos).setY(1.2);
      c.head.getWorldPosition(_v2);
      _q1.copy(c.head.quaternion);
      _q2.setFromRotationMatrix(_m1.lookAt(_v1, _v2, UP));
      c.head.quaternion.rotateTowards(_q2, 35 * D * dt);
      c.servoCd -= dt;
      if (_q1.angleTo(c.head.quaternion) > 0.003 && c.servoCd <= 0) { c.servoCd = 2.5; c.root.getWorldPosition(_v1); app.audio.playAt('sfx_servo', _v1, 0.35, 12); }
    }
    const f = this.feed;
    if (f && f.on) {
      f.t -= dt;
      if (f.t <= 0) {
        f.t = 1 / 12;
        const scr = this.reg.cctvMonitor.mesh, r = app.renderer;
        scr.visible = false;
        r.setRenderTarget(f.rt);
        r.render(this.scene, f.cam);
        r.setRenderTarget(null);
        scr.visible = true;
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
    if (seat.dir !== 0) {
      seat.trans = Math.min(1, seat.trans + dt / (seat.dir > 0 ? 0.6 : 0.5));
      const e = seat.trans * seat.trans * (3 - 2 * seat.trans);
      if (seat.dir > 0) { seat.toPos.copy(this.seatView.pos); seat.toQuat.copy(this.seatView.quat); }
      else this.headPose(seat.toPos, seat.toQuat);
      cam.position.lerpVectors(seat.from.pos, seat.toPos, e);
      cam.quaternion.slerpQuaternions(seat.from.quat, seat.toQuat, e);
      if (seat.trans >= 1) {
        if (seat.dir > 0) {
          seat.seated = true; this.term.acceptInput = true; this.vars.set('sat_once', '1');
          if (this.vars.get('objective_seat') === '1') { this.vars.remove('objective_seat'); setObjective(null); }
        } else this.finishStand();
        seat.dir = 0;
      }
      return;
    }
    if (seat.seated) {
      seat.breathe += dt;
      cam.position.copy(this.seatView.pos).y += Math.sin(seat.breathe * 1.1) * 0.0015;
      cam.quaternion.copy(this.seatView.quat);
      return;
    }
    // 카메라 연출: 정해진 곳을 부드럽게 바라본다
    if (this.lookAim) {
      const tg = this.lookAim.get();
      const dx = tg.x - p.pos.x, dy = tg.y - EYE, dz = tg.z - p.pos.z;
      const k = 1 - Math.exp(-this.lookAim.k * dt);
      p.yaw = lerpAngle(p.yaw, Math.atan2(-dx, -dz), k);
      p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    }
    // 이동
    let fx = 0, fz = 0;
    if (p.move) {
      const k = keys;
      const z = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const len = Math.hypot(x, z);
      if (len > 0) {
        p.sprint = (k.ShiftLeft || k.ShiftRight) && z > 0;
        const sp = (p.sprint ? SPRINT : WALK) / Math.max(1, len);
        const f0 = -Math.sin(p.yaw), f1 = -Math.cos(p.yaw), r0 = Math.cos(p.yaw), r1 = -Math.sin(p.yaw);
        fx = (f0 * z + r0 * x) * sp; fz = (f1 * z + r1 * x) * sp;
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
      if (p.stepAcc >= (p.sprint ? 0.95 : 0.68)) { p.stepAcc = 0; app.audio.step(Math.abs(p.pos.z) > 5.05, p.sprint); }
      p.bob += dt * (p.sprint ? 13 : 8.5);
    } else p.stepAcc = 0.5;
    const amp = p.moving ? (p.sprint ? 0.035 : 0.018) : 0;
    p.bobY += (Math.abs(Math.sin(p.bob)) * amp - p.bobY) * Math.min(1, dt * 10);
    this.headPose(cam.position, cam.quaternion);
    // 상호작용 대상 찾기
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

  interact() {
    const it = this.current; if (!it) return;
    const h = it.active(); if (h) h.use();
  }
}

// ---------- 입력 ----------
const keys = {};
const modalOpen = () => !$('chickenwarn').hidden || !$('album').hidden || !$('settings').hidden || !$('confirm').hidden;
function bindInput() {
  const canvas = app.renderer.domElement;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    const s = app.session;
    if (e.code === 'Escape') { onEscape(); return; }
    if (!s || app.paused || app.phase !== 'play' || modalOpen()) return;
    if (e.code === 'KeyE') {
      if (s.seat.seated) s.stand(false);
      else if (!s.seat.dir) s.interact();
      advanceMonologue();
    }
    if ((e.code === 'Space' || e.code === 'Enter') && s.seat.seated) { s.term.click(null, null); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', (e) => {
    const s = app.session;
    if (!s || app.phase !== 'play' || app.paused || modalOpen()) return;
    if (!app.locked) tryLock();
    if (e.button !== 0) return;
    if (s.seat.seated) {
      const pt = app.locked ? [s.term.cursor.x, s.term.cursor.y] : screenToTerm(e.clientX, e.clientY);
      s.term.click(pt ? pt[0] : null, pt ? pt[1] : null);
    } else advanceMonologue();
  });
  window.addEventListener('mousemove', (e) => {
    const s = app.session;
    if (!s || app.phase !== 'play' || app.paused) return;
    if (s.seat.seated) {
      if (app.locked) {
        const c = s.term.cursor;
        s.term.pointer(Math.max(0, Math.min(TERM_W, c.x + e.movementX * 1.5)), Math.max(0, Math.min(TERM_H, c.y + e.movementY * 1.5)));
      } else {
        const pt = screenToTerm(e.clientX, e.clientY);
        if (pt) s.term.pointer(pt[0], pt[1]); else s.term.pointer(null);
      }
      return;
    }
    if (!s.p.look) return;
    if (app.locked || (e.buttons & 1)) {
      const k = 0.0016 + settings.sens * 0.006;
      s.p.yaw -= e.movementX * k;
      s.p.pitch = Math.max(-82 * D, Math.min(82 * D, s.p.pitch - e.movementY * k));
    }
  });
  window.addEventListener('wheel', (e) => { const s = app.session; if (s && s.seat.seated && app.phase === 'play') s.term.scroll(e.deltaY < 0 ? 1 : -1); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const was = app.locked;
    app.locked = document.pointerLockElement === canvas;
    const s = app.session;
    if (was && !app.locked && s && app.phase === 'play' && !app.paused && !modalOpen()) {
      if (s.seat.seated) s.stand(false);
      else if (!s.seat.dir) pause();
    }
    $('clickhint').hidden = !(app.phase === 'play' && !app.locked && !app.paused && s && !s.seat.seated && !modalOpen());
  });
  $('clickhint').addEventListener('click', () => tryLock());
}

function tryLock() {
  const c = app.renderer.domElement;
  try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 지원 안 함: 드래그로 시점 */ }
}

function screenToTerm(cx, cy) {
  const s = app.session; if (!s || !s.reg.live) return null;
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, app.camera);
  const hit = rc.intersectObject(s.reg.live, false)[0];
  if (!hit || !hit.uv) return null;
  const [u, v] = crtCurve(hit.uv.x, hit.uv.y);
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [u * TERM_W, (1 - v) * TERM_H];
}

function onEscape() {
  const s = app.session; if (!s) return;
  if (!$('chickenwarn').hidden) { $('chickenno').click(); return; }
  if (!$('settings').hidden) { closeSettings(); return; }
  if (!$('album').hidden) { closeAlbum(); return; }
  if (app.phase === 'replay') { if (!$('endbuttons').hidden) closeReplay(); return; }
  if (app.phase !== 'play') return;
  if (!$('confirm').hidden) { hideConfirm(); s.p.move = s.p.look = true; return; }
  if (app.paused) { resume(); return; }
  if (s.seat.seated) { s.stand(false); return; }
  if (!s.seat.dir) pause();
}

// ---------- HUD ----------
let monoQueue = [], monoTimer = 0, monoSkip = false, objectiveAge = 0, captionT = 0, helpT = 0, flashV = 0, jsT = 0;
let shakeA = 0, shakeT = 0, shakeDur = 1;
function setPrompt(text) { const el = $('prompt'); const s = text ? '[E]  ' + text : ''; if (el.textContent !== s) el.textContent = s; $('ring').hidden = !text; }
function setCrosshair(on) { $('dot').hidden = !on; if (!on) setPrompt(null); }
function setObjective(text) { $('objective').textContent = text || ''; objectiveAge = 0; }
function monologue(lines) { monoQueue.push(...lines.filter(Boolean)); if (monoTimer <= 0) nextMono(); }
function nextMono() {
  const el = $('mono');
  if (!monoQueue.length) { el.textContent = ''; el.style.opacity = 0; monoTimer = 0; return; }
  const l = monoQueue.shift(); el.textContent = l; el.style.opacity = 1; monoTimer = 2.4 + l.length * 0.06;
}
function advanceMonologue() { if (monoTimer > 0 && monoQueue.length) monoSkip = true; }
function caption(text) { $('caption').textContent = '(' + text + ')'; captionT = 3.5; }
function help(text, tt) { $('help').textContent = text; helpT = tt; }
function flash(v) { flashV = Math.max(flashV, v * (REDUCED ? 0.4 : 1)); }
function shake(amp, dur) { shakeA = amp * (REDUCED ? 0.25 : 1); shakeT = shakeDur = dur; }
function countdown(n) {
  const el = $('countdown');
  if (n == null) { el.hidden = true; return; }
  $('cdlabel').textContent = t('countdown');
  const num = $('cdnum');
  num.textContent = String(n);
  el.hidden = false;
  num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
}
function jumpscare(cat, dur) {
  const el = $('jumpscare');
  el.classList.toggle('cat', !!cat); el.classList.toggle('face', !cat);
  for (const im of el.querySelectorAll('img')) { im.style.animation = 'none'; void im.offsetWidth; im.style.animation = ''; }
  el.hidden = false;
  jsT = dur;
}
function hideJumpscare() { $('jumpscare').hidden = true; jsT = 0; }
function updateBadge() { $('chickenbadge').hidden = !(settings.chicken && (app.phase === 'play' || app.phase === 'intro')); }
function updateHud(dt) {
  if (monoTimer > 0) { monoTimer -= dt; if (monoSkip || monoTimer <= 0) { monoSkip = false; nextMono(); } else if (monoTimer < 0.4) $('mono').style.opacity = Math.max(0, monoTimer / 0.4); }
  objectiveAge += dt; $('objective').style.opacity = objectiveAge < 6 ? 1 : Math.max(0.55, 1 - (objectiveAge - 6) / 3 * 0.45);
  if (captionT > 0) { captionT -= dt; $('caption').style.opacity = Math.min(1, captionT / 0.6); if (captionT <= 0) $('caption').textContent = ''; }
  if (helpT > 0) { helpT -= dt; $('help').style.opacity = Math.min(1, helpT / 0.6); if (helpT <= 0) $('help').textContent = ''; }
  if (jsT > 0) { jsT -= dt; if (jsT <= 0) hideJumpscare(); }
  flashV = Math.max(0, flashV - dt * 3);
}

let fadeV = 0, fadeTarget = 0, fadeSpeed = 1;
function fadeTo(v, tt) { fadeTarget = v; fadeSpeed = 1 / Math.max(0.01, tt); return new Promise((r) => { const chk = () => (Math.abs(fadeV - fadeTarget) < 0.001 ? r() : setTimeout(chk, 30)); chk(); }); }
function setFade(v) { fadeV = fadeTarget = v; }

// ---------- 흐름 ----------
function newSession(vars) {
  if (app.session) app.session.dispose();
  app.session = new Session(vars);
  setObjective(null); setPrompt(null); monoQueue = []; nextMono();
  countdown(null); hideJumpscare();
}

function refreshTitle() {
  const n = endingsFound();
  $('endcount').textContent = t('endCount', { n, t: ENDING_COUNT });
  $('albumbtn').hidden = n === 0;
  $('albumnew').hidden = !(n > store.get('album_seen', 0));
  $('chickenbtn').textContent = `${t('chicken')}: ${settings.chicken ? t('on') : t('off')}`;
  $('chickennote').hidden = !settings.chicken;
  $('chickennote').textContent = t('chickenNote');
  $('langbtn').textContent = t('language');
}

function showTitle() {
  app.phase = 'title';
  const s = app.session;
  s.p.move = s.p.look = false;
  setCrosshair(false); updateBadge(); countdown(null);
  setFade(1); fadeTo(0, 1.5);
  app.audio.setMusic('title');
  refreshTitle();
  $('title').hidden = false;
  app.renderer.shadowMap.needsUpdate = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

async function startGame() {
  $('title').hidden = true;
  app.phase = 'intro';
  updateBadge();
  tryLock();
  await fadeTo(1, 1);
  app.audio.setMusic('none');
  await playIntro();
  beginPlay();
  $('intro').hidden = true;
  await fadeTo(0, 1.6);
}

async function playIntro() {
  const el = $('introtext');
  $('intro').hidden = false;
  el.textContent = '';
  let skip = false;
  const onSkip = () => { skip = true; };
  window.addEventListener('mousedown', onSkip);
  window.addEventListener('keydown', onSkip);
  const wait = (ms) => new Promise((r) => { const t0 = performance.now(); const chk = () => (skip || performance.now() - t0 >= ms ? r() : requestAnimationFrame(chk)); chk(); });
  let text = '';
  for (const line of app.story.intro) {
    for (let i = 1; i <= line.length && !skip; i++) { el.textContent = text + line.slice(0, i); if (line[i - 1] !== ' ' && i % 2 === 0) app.audio.play2D('sfx_blip', 0.18); await wait(40); }
    if (skip) break;
    text += line + '\n'; el.textContent = text;
    await wait(line ? 900 : 300);
  }
  if (!skip) await wait(2500);
  window.removeEventListener('mousedown', onSkip);
  window.removeEventListener('keydown', onSkip);
}

function beginPlay() {
  const s = app.session;
  const sp = s.reg.spawn;
  s.p.pos.set(sp.x, 0, -sp.z); s.p.yaw = -sp.yaw * D; s.p.pitch = 0;
  s.p.move = s.p.look = true;
  setCrosshair(true);
  app.audio.setMusic('game'); app.audio.setTension(0);
  app.phase = 'play';
  updateBadge();
  s.vars.set('objective_seat', '1');
  setObjective(t('objSeat'));
  help(t('help'), 10);
  s.runStory(app.story.start).catch((e) => console.error(e));
  $('clickhint').hidden = app.locked;
}

function restart() {
  hidePause();
  app.paused = false; app.audio.suspend(false);
  newSession(null);
  app.audio.stopLayers(); app.audio.startLayers();
  (async () => { setFade(1); app.phase = 'intro'; updateBadge(); tryLock(); await playIntro(); beginPlay(); $('intro').hidden = true; await fadeTo(0, 1.4); })();
}

function toTitle() {
  hidePause(); $('ending').hidden = true;
  app.paused = false; app.audio.suspend(false);
  newSession(null);
  app.audio.stopLayers(); app.audio.startLayers();
  showTitle();
}

function retryChase() {
  if (!app.chaseSnapshot) { restart(); return; }
  $('ending').hidden = true;
  newSession(app.chaseSnapshot);
  app.audio.stopLayers(); app.audio.startLayers();
  const s = app.session, ds = s.reg.deskStand;
  s.p.pos.set(ds.x, 0, -ds.z); s.p.yaw = -ds.yaw * D; s.p.pitch = 0;
  s.p.move = s.p.look = true; setCrosshair(true);
  app.audio.setMusic('game');
  s.term.clearBody(); s.term.showCenter(t('termClosed'), '');
  app.phase = 'play';
  updateBadge();
  tryLock();
  setFade(1); fadeTo(0, 1.2);
  s.runStory(app.story.chaseRetry || app.story.start).catch((e) => console.error(e));
}

function askLeave() {
  const s = app.session; if (app.phase !== 'play') return;
  s.p.move = s.p.look = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('confirmq').textContent = t('leaveQ');
  $('confirm').hidden = false;
  $('yes').onclick = () => { hideConfirm(); triggerEnding('END_5'); };
  $('no').onclick = () => { hideConfirm(); s.p.move = s.p.look = true; tryLock(); };
}
function hideConfirm() { $('confirm').hidden = true; }

function triggerEnding(id) {
  if (app.phase === 'ending') return;
  const e = app.story.endings.get(id); if (!e) { console.error('엔딩 없음', id); return; }
  endingRoutine(e);
}

async function endingRoutine(e) {
  const s = app.session;
  app.phase = 'ending';
  if (app.paused) resume();
  s.alive = false; // 진행 중인 이야기·이벤트 중단
  s.cancelScare();
  s.resetCine();
  s.p.move = s.p.look = false;
  if (s.chase && !s.chase.done) { s.chase.done = true; s.stopChaseAudio(s.chase); }
  setCrosshair(false); setObjective(null); updateBadge();
  const lines = app.story.visibleLines(e.lines, s.vars).map((l) => s.vars.format(l.text));
  const before = endingsFound();
  store.set('end_' + e.number, 1);
  store.set('endvars_' + e.number, [...s.vars.m.entries()]);
  app.audio.silenceAll();
  await fadeTo(1, e.bad ? 0.6 : 2.0);
  app.audio.stopAllLoops();
  app.audio.setMusic('ending');
  if (document.pointerLockElement) document.exitPointerLock();
  await presentEnding(e, lines, false);
  if (before === 0) $('endnote').textContent = t('firstEnd');
}

/** 검은 화면 + ENDING n + 결말 (replay: 앨범에서 다시 읽기) */
async function presentEnding(e, lines, replay) {
  const box = $('ending');
  $('endnum').textContent = ''; $('endtitle').textContent = ''; $('endbody').textContent = ''; $('endnote').textContent = '';
  $('endbuttons').hidden = true;
  box.hidden = false; box.style.opacity = 0;
  let skip = false;
  const onSkip = () => { skip = true; };
  window.addEventListener('mousedown', onSkip);
  window.addEventListener('keydown', onSkip);
  const wait = async (ms) => { const until = performance.now() + ms; while (performance.now() < until && !skip) await sleepMs(30); skip = false; };
  for (let a = 0; a <= 1; a += 0.05) { box.style.opacity = a; await sleepMs(replay ? 15 : 40); }
  box.style.opacity = 1;
  await wait(replay ? 300 : 800);
  $('endnum').textContent = 'ENDING ' + e.number + (e.bad ? '  ·  ' + t('badEnd') : '');
  await wait(replay ? 400 : 900);
  $('endtitle').textContent = e.title;
  await wait(replay ? 700 : 1500);
  for (const text of lines) {
    const p = document.createElement('p'); p.textContent = text; $('endbody').appendChild(p);
    await wait(1600 + text.length * 35);
  }
  window.removeEventListener('mousedown', onSkip);
  window.removeEventListener('keydown', onSkip);
  await sleepMs(500);
  $('endtotitle').hidden = replay;
  $('retry').hidden = replay || !e.retryChase;
  $('endclose').hidden = !replay;
  $('endbuttons').hidden = false;
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 엔딩 앨범 ----------
function openAlbum() {
  const grid = $('albumgrid');
  grid.textContent = '';
  const ends = [...app.story.endings.values()].sort((a, b) => a.number - b.number);
  for (const e of ends) {
    const found = !!store.get('end_' + e.number, 0);
    const card = document.createElement('div');
    card.className = 'card ' + (found ? 'found' : 'locked');
    const add = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; d.textContent = text; card.appendChild(d); return d; };
    add('num', 'ENDING ' + e.number + (found && e.bad ? '  ·  ' + t('badEnd') : ''));
    add('ttl', found ? e.title : t('locked'));
    if (found) {
      const first = e.lines.find((l) => !l.cond);
      if (first) add('desc', new Vars().format(first.text));
      const b = add('', t('readAgain'), 'button'); b.type = 'button'; b.onclick = () => replayEnding(e);
    } else {
      const h = add('hinttext', t('hint') + ' · ' + e.hint); h.hidden = true;
      const b = add('', t('hint'), 'button'); b.type = 'button';
      b.onclick = () => { h.hidden = false; b.hidden = true; };
    }
    grid.appendChild(card);
  }
  $('albumcount').textContent = t('albumFound', { n: endingsFound(), t: ENDING_COUNT });
  $('album').hidden = false;
  store.set('album_seen', endingsFound());
  refreshTitle();
}
function closeAlbum() { $('album').hidden = true; }

async function replayEnding(e) {
  closeAlbum();
  $('title').hidden = true;
  app.phase = 'replay';
  const saved = store.get('endvars_' + e.number, null);
  const v = new Vars();
  if (Array.isArray(saved)) for (const [k, val] of saved) v.set(k, val);
  await presentEnding(e, app.story.visibleLines(e.lines, v).map((l) => v.format(l.text)), true);
}
function closeReplay() { $('ending').hidden = true; showTitle(); openAlbum(); }

// ---------- 겁쟁이 모드 · 언어 ----------
function requestChicken(on) {
  if (!on) { setChicken(false); return; }
  // 켤 때만 경고를 띄운다
  $('chickenbody').textContent = t('chickenBody');
  $('chickenwarn').hidden = false;
  $('chickenyes').onclick = () => { $('chickenwarn').hidden = true; setChicken(true); };
  $('chickenno').onclick = () => { $('chickenwarn').hidden = true; };
  $('chickenno').focus();
}
function setChicken(on) {
  settings.chicken = !!on;
  store.set('chicken', settings.chicken);
  app.session?.applyChicken(settings.chicken);
  refreshTitle(); refreshSettings(); updateBadge();
}

function toggleLanguage() {
  settings.lang = getLang() === 'ko' ? 'en' : 'ko';
  store.set('lang', settings.lang);
  setLang(settings.lang); applyDom(); document.title = t('gameTitle');
  makeStory();
  newSession(null); // 쪽지·포스터 글자도 바뀌도록 사무실을 다시 만든다
  refreshTitle(); refreshSettings();
  app.renderer.shadowMap.needsUpdate = true;
}

function pause() {
  if (app.phase !== 'play' || app.paused) return;
  app.paused = true;
  app.audio.suspend(true);
  $('pause').hidden = false;
  $('clickhint').hidden = true;
}
function resume() {
  app.paused = false;
  app.audio.suspend(false);
  hidePause();
  tryLock();
  const s = app.session;
  $('clickhint').hidden = app.locked || !s || s.seat.seated;
}
function hidePause() { $('pause').hidden = true; }

function refreshSettings() { $('set_chicken').textContent = settings.chicken ? t('on') : t('off'); }
function openSettings() {
  $('settings').hidden = false;
  for (const k of ['brightness', 'master', 'music', 'sens']) { $('set_' + k).value = Math.round(settings[k] * 100); $('val_' + k).textContent = Math.round(settings[k] * 100) + '%'; }
  refreshSettings();
}
function closeSettings() { $('settings').hidden = true; saveSettings(); }
function applySettings() { app.audio.masterVol = settings.master; app.audio.musicVol = settings.music; app.audio.applyVolumes(); }

// ---------- 루프 ----------
function frame() {
  requestAnimationFrame(frame);
  const raw = app.clock.getDelta();
  const dt = Math.min(app.maxDt, raw);
  app.time += dt;
  const s = app.session;
  fadeV += Math.sign(fadeTarget - fadeV) * Math.min(Math.abs(fadeTarget - fadeV), fadeSpeed * dt);
  if (!s) return;
  if (!app.paused) {
    if (app.phase === 'play') s.update(dt);
    else if (app.phase === 'title' || app.phase === 'gate') {
      const tt = app.time, tc = s.reg.titleCam;
      app.camera.position.set(tc.pos[0] + Math.sin(tt * 0.07) * 0.25, tc.pos[1] + Math.sin(tt * 0.11) * 0.05, -(tc.pos[2] + Math.cos(tt * 0.05) * 0.15));
      app.camera.lookAt(tc.look[0], tc.look[1], -tc.look[2]);
      s.term.update(dt, app.time);
      s.updateLights(dt);
    }
    app.audio.update(dt);
  }
  app.audio.listener(app.camera);
  updateHud(dt);
  adaptQuality(raw);
  // 화면이 다른 것에 완전히 가려져 있으면 그리지 않는다 (일시정지·인트로·엔딩)
  const covered = app.paused || app.phase === 'replay' || (app.phase === 'intro' && !$('intro').hidden) || (app.phase === 'ending' && fadeV >= 0.999);
  if (covered) return;
  if (shakeT > 0) {
    shakeT -= dt;
    const k = shakeA * Math.max(0, shakeT / shakeDur);
    app.camera.position.x += (Math.random() * 2 - 1) * k;
    app.camera.position.y += (Math.random() * 2 - 1) * k;
    app.camera.rotateZ((Math.random() * 2 - 1) * k * 0.6);
  }
  const pm = app.postMat.uniforms;
  const b = settings.brightness, ck = s.chicken, tn = ck ? 0 : (s.tension || 0);
  pm.exposure.value = 0.8 + 1.2 * b + (ck ? 0.25 : 0); pm.gammaV.value = 1.2 - 0.48 * b - (ck ? 0.05 : 0);
  pm.vignette.value = (ck ? 0.3 : 0.55) + tn * 0.08; pm.grain.value = (ck ? 0.02 : 0.035) + tn * 0.012;
  pm.chroma.value = 0.012 + tn * 0.006; pm.desat.value = (ck ? 0.05 : 0.25) + tn * 0.06;
  pm.flash.value = flashV; pm.fade.value = fadeV; pm.time.value = app.time;
  app.renderer.getDrawingBufferSize(pm.resolution.value);
  app.renderer.setRenderTarget(app.rt);
  app.renderer.render(s.scene, app.camera);
  app.renderer.setRenderTarget(null);
  app.renderer.render(app.postScene, app.postCam);
}

// ---------- 메뉴 연결 ----------
function wire() {
  $('gate').addEventListener('click', () => {
    app.audio.resume();
    app.audio.startLayers();
    applySettings();
    $('gate').hidden = true;
    showTitle();
  });
  $('start').onclick = () => { app.audio.play2D('sfx_ui_select', 0.4); startGame(); };
  $('albumbtn').onclick = () => openAlbum();
  $('closealbum').onclick = () => closeAlbum();
  $('chickenbtn').onclick = () => requestChicken(!settings.chicken);
  $('set_chicken').onclick = () => requestChicken(!settings.chicken);
  $('langbtn').onclick = () => toggleLanguage();
  $('titlesettings').onclick = () => openSettings();
  $('resume').onclick = () => resume();
  $('pausesettings').onclick = () => openSettings();
  $('restart').onclick = () => restart();
  $('totitle').onclick = () => toTitle();
  $('closesettings').onclick = () => closeSettings();
  $('endtotitle').onclick = () => toTitle();
  $('retry').onclick = () => retryChase();
  $('endclose').onclick = () => closeReplay();
  for (const k of ['brightness', 'master', 'music', 'sens']) {
    $('set_' + k).addEventListener('input', (e) => { settings[k] = e.target.value / 100; $('val_' + k).textContent = e.target.value + '%'; applySettings(); });
  }
  // 버튼에 마우스를 올리면 작은 소리 (나중에 만든 앨범 버튼 포함)
  let hovered = null;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (b && b !== hovered && app.audio.ctx) app.audio.play2D('sfx_ui_hover', 0.3);
    hovered = b;
  });
  // 자동 확인용 (개발자 검사): 주소 끝에 #autotest
  if (location.hash === '#autotest') {
    window.__ne = { app, settings, triggerEnding, startGame, beginPlay, setChicken, toggleLanguage, openAlbum, endingsFound,
      scare: (kind) => app.session.scare({ kind }) };
  }
}

wire();
boot();
