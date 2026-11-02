// 야간 평가실 — 브라우저 테스트판. 이야기·배치·소리·텍스처는 Unity 프로젝트와 같은 데이터.
import { THREE, D, place, mergeStatic, disposeTree, postMaterial, crtCurve } from './kit.js';
import { parseJsonc, Vars, Story } from './story.js';
import { buildWorld, MatLib, buildCat } from './world.js';
import { Terminal, TERM_W, TERM_H } from './terminal.js';
import { AudioSys } from './audio.js';

const $ = (id) => document.getElementById(id);
const TEX = ['carpet', 'floor_tile', 'ceiling_tile', 'wall', 'desk_top', 'metal', 'plastic', 'fabric', 'cardboard', 'cat_fur', 'door',
  'keyboard', 'tower_front', 'notice', 'badge117', 'badge116', 'sticky', 'clock_face', 'sign_room', 'panel', 'calendar', 'elevator',
  'exit_sign', 'window_night', 'screen_117'];
const ENDING_COUNT = 6;
const EYE = 1.62, RADIUS = 0.3, WALK = 2.3, SPRINT = 4.9, REACH = 2.3;

// ---------- 저장 (이 브라우저에만) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ne_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ne_' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
};
const settings = { brightness: store.get('brightness', 0.5), master: store.get('master', 0.8), music: store.get('music', 0.7), sens: store.get('sens', 0.45) };
const saveSettings = () => { for (const k of Object.keys(settings)) store.set(k, settings[k]); };
const endingsFound = () => { let n = 0; for (let i = 1; i <= ENDING_COUNT; i++) if (store.get('end_' + i, 0)) n++; return n; };

// ---------- 전역 ----------
const app = {
  renderer: null, scene: null, camera: null, rt: null, postMat: null, postScene: null, postCam: null,
  story: null, layoutJson: null, textures: new Map(), audio: new AudioSys(), session: null,
  phase: 'loading', paused: false, chaseSnapshot: null, clock: new THREE.Clock(), time: 0, locked: false,
};

// ---------- 시작 ----------
async function boot() {
  const bar = $('loadbar');
  const progress = (p) => { bar.style.width = Math.round(p * 100) + '%'; };
  try {
    const [storyText, layoutText] = await Promise.all([fetch('data/story.json').then((r) => r.text()), fetch('data/office_layout.json').then((r) => r.text())]);
    app.story = new Story(parseJsonc(storyText));
    app.layoutJson = parseJsonc(layoutText);
    await loadFonts();
    progress(0.1);
    const loader = new THREE.TextureLoader();
    await Promise.all(TEX.map((n) => new Promise((res) => loader.load(`tex/${n}.png`, (t) => { app.textures.set(n, t); res(); }, undefined, () => { console.warn('텍스처 실패', n); res(); }))));
    progress(0.3);
    await app.audio.load('audio', (p) => progress(0.3 + p * 0.65));
    setupRenderer();
    newSession(null);
    progress(1);
    $('loading').hidden = true;
    $('gate').hidden = false;
    app.phase = 'gate';
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    $('loadmsg').textContent = '불러오기 실패: ' + e.message;
  }
}

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
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  r.setSize(window.innerWidth, window.innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  $('view').appendChild(r.domElement);
  app.renderer = r;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  app.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
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
  const s = r.getDrawingBufferSize(new THREE.Vector2());
  app.rt.setSize(s.x, s.y);
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
}

// ---------- 세션 (처음부터 다시 = 통째로 새로 만든다) ----------
class Session {
  constructor(vars) {
    this.alive = true;
    this.vars = vars ? vars.clone() : new Vars();
    if (!this.vars.get('clock')) this.vars.set('clock', '00:41');
    this.timers = []; this.waiters = [];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03060b);
    scene.fog = new THREE.FogExp2(0x03060b, 0.075);
    this.scene = scene;
    const amb = new THREE.AmbientLight(0xffffff, 1); amb.color.setRGB(0.05, 0.06, 0.085); scene.add(amb);
    this.mats = new MatLib(app.textures);
    this.reg = buildWorld(app.layoutJson, this.mats, scene);
    mergeStatic(this.reg.root, scene);
    this.term = new Terminal(this.reg.live, this.reg.crtLight, this.reg.crtGlow, (n, v) => this.termSfx(n, v));
    this.term.setHeader('평가 단말기 v2.3', '', this.vars.get('clock'));
    this.term.showCenter('평가 단말기', '평가자 117 · 로그인 대기');
    // 플레이어
    const sp = this.reg.spawn;
    this.p = { pos: new THREE.Vector3(sp.x, 0, -sp.z), yaw: -sp.yaw * D, pitch: 0, move: false, look: false, sprint: false, stepAcc: 0.5, bob: 0, moving: false };
    this.seat = { seated: false, trans: 0, dir: 0, from: null, to: null, breathe: 0 };
    this.seatView = this.computeSeatView();
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.current = null;
    this.loops = new Map();
    this.cctvFeed = null;
    this.chase = null;
    this.tension = 0;
    this.fog = { from: 0.075, to: 0.075, t: 1, dur: 1 };
    this.setupInteractions();
    this.startAmbient();
  }

  dispose() {
    this.alive = false;
    app.audio.stopAllLoops();
    disposeTree(this.scene);
    for (const m of this.mats.cache.values()) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
    if (this.cctvFeed) this.cctvFeed.rt.dispose();
    this.term.tex.dispose();
  }

  termSfx(name, vol) {
    const s = this.reg.live; if (!s) return;
    const p = new THREE.Vector3(); s.getWorldPosition(p);
    app.audio.playAt(name, p, vol, 9, 0.05);
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
    const m = new THREE.Matrix4().lookAt(pos, sp, new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), sp, n };
  }

  headPose() {
    const p = this.p;
    const pos = new THREE.Vector3(p.pos.x, EYE + (p.bobY || 0), p.pos.z);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    return { pos, quat };
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
    if (app.phase === 'play') { this.p.move = this.p.look = true; setCrosshair(true); }
  }

  // ---------- 상호작용 기본값 (Unity EnvironmentDirector 와 동일) ----------
  setupInteractions() {
    const reg = this.reg, story = app.story, v = this.vars;
    const key = (id) => (id.startsWith('Window') ? 'window' : id.startsWith('crt_') ? 'dead_pc' : /^D\d\d$/.test(id) ? 'desk' : id);
    for (const [id, it] of reg.its) {
      if (reg.doors.has(id) || id === 'Computer') continue;
      const k = key(id);
      if (!story.inspects.has(k)) continue;
      it.add('살펴본다', () => true, () => this.inspect(k), 0, this);
    }
    reg.its.get('Computer')?.add('컴퓨터 사용', () => app.phase === 'play' && !this.seat.seated && !this.seat.dir, () => this.sit(), 0, this);
    for (const [id, door] of reg.doors) {
      const it = reg.its.get(id); if (!it) continue;
      it.add('문을 열어본다', () => door.locked && !(id === 'ExitDoor' && v.truthy('chase')), () => {
        app.audio.playAt('sfx_door_locked', this.anchorPos(id), 0.6, 10); this.inspect(id + '_locked');
      }, 1, this);
      if (id === 'FrontDoor') {
        it.add('퇴근한다', () => !door.locked && !v.truthy('final') && !v.truthy('chase') && app.phase === 'play', () => askLeave(), 2, this);
      } else if (id === 'BackDoor') {
        it.add('문을 연다', () => !door.locked && door.amount < 0.5 && !door.busy, () => {
          door.setOpen(1, 1.4); app.audio.playAt('sfx_door_open', this.anchorPos(id), 0.7, 14); v.set('back_ajar', '1'); this.setDraft(0.35);
        }, 2, this);
        it.add('문을 닫는다', () => !door.locked && door.amount >= 0.5 && !door.busy && !v.truthy('chase'), () => {
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
      try { this.act(a); } catch (e) { console.error('동작 오류', id, a.do, e); }
    }
  }
  act(a) {
    const reg = this.reg, v = this.vars, A = app.audio, t = a.target || '';
    switch (a.do) {
      case 'set': v.apply(a.value || ''); break;
      case 'door': { const d = reg.doors.get(t); if (!d) break; if ('locked' in a) d.setLocked(!!a.locked); if ('open' in a) d.setOpen(a.open, a.time ?? 1.5); break; }
      case 'drawer': { const dr = reg.drawers.get(t); if (dr) dr.open = true; break; }
      case 'light': for (const l of this.lights(t)) l.fadeTo(a.level ?? 1, a.time ?? 1); break;
      case 'flicker': for (const l of this.lights(t)) l.flicker = a.on ?? true; break;
      case 'hum': A.setHum(a.on ?? true, a.time ?? 1); A.setLoopVol(this.loops.get('fan'), (a.on ?? true) ? 0.3 : 0); break;
      case 'sound': {
        if (a.loop) { const lp = A.loop3D(a.clip, this.anchorObj(a.at), a.volume ?? 0.8, 1, a.range ?? 14); this.loops.set(a.id || a.clip, lp); }
        else A.playAt(a.clip, this.resolvePos(a.at || 'player'), a.volume ?? 0.8, a.range ?? 20, 0.03);
        break;
      }
      case 'stopsound': A.fadeLoop(this.loops.get(a.id), 0.6); this.loops.delete(a.id); break;
      case 'cctv': this.cctv(a); break;
      case 'terminal': if ('power' in a) this.term.setPower(a.power, a.time ?? 0.6); if ('glitch' in a) this.term.glitchFx(a.glitch, a.time ?? 0.5); break;
      case 'glitch': this.term.glitchFx(a.amount ?? 0.6, a.time ?? 0.4); flash(a.flash ?? 0); break;
      case 'phone':
        if (a.ring ?? true) { A.fadeLoop(this.loops.get('phone'), 0.1); this.loops.set('phone', A.loop3D('sfx_phone', reg.anchors.get('Phone'), 0.55, 1, 16)); }
        else { A.fadeLoop(this.loops.get('phone'), 0.3); this.loops.delete('phone'); }
        break;
      case 'checkpoint': this.checkpoint(a); break;
      case 'hint': setObjective(v.format(a.text || '')); break;
      case 'caption': caption(v.format(a.text || '')); break;
      case 'monologue': if (a.inspect) this.inspect(a.inspect); else monologue([v.format(a.text || '')]); break;
      case 'tension': { const lv = a.level | 0; A.setTension(lv); this.term.tension = lv; this.tension = lv; v.set('tension', lv); break; }
      case 'fog': this.fog = { from: this.scene.fog.density, to: a.density ?? 0.08, t: 0, dur: Math.max(0.01, a.time ?? 3) }; break;
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

  cctv(a) {
    const c = this.reg.cctv; if (!c) return;
    if ('led' in a) c.led.material = a.led ? c.ledOn : c.ledOff;
    if ('track' in a) c.tracking = !!a.track;
    if (a.feed) {
      if (!this.cctvFeed) {
        const rt = new THREE.WebGLRenderTarget(320, 240);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        const cam = new THREE.PerspectiveCamera(78, 4 / 3, 0.1, 30);
        cam.rotation.y = Math.PI; // 머리의 +z(렌즈) 방향을 본다
        cam.position.z = 0.15;
        c.head.add(cam);
        cam.layers.enable(1);
        this.cctvFeed = { rt, cam, t: 0 };
      }
      this.reg.cctvMonitor.turnOn(this.cctvFeed.rt.texture, [0.75, 0.95, 0.85], 1.6, 0.5);
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
    const v = this.vars, flag = a.flag || '', created = this.elapsed || 0;
    const pattern = a.target || '';
    const targets = [];
    for (const [id, it] of this.reg.its) if (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern) targets.push(it);
    if (!targets.length) { console.warn('확인 지점 대상 없음', pattern); v.set(flag, '1'); return; }
    const owner = {};
    for (const it of targets) {
      it.add(a.prompt || '확인한다', () => !v.truthy(flag), () => {
        if (v.truthy(flag)) return;
        v.set(flag, '1');
        if (a.place) v.set('last_place', a.place);
        if (a.timer) v.set(a.timer, Math.max(1, Math.round((this.elapsed || 0) - created)));
        for (const t2 of targets) t2.removeOwner(owner);
        this.inspect(a.inspect || '');
        app.audio.play2D('sfx_check', 0.25);
        if (a.then) this.fire(a.then);
      }, 100, owner);
    }
  }

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
        term.showCenter(node.wait.screen ? v.format(node.wait.screen) : '다음 기록 대기 중', '· · ·');
        const hint = v.format(node.wait.hint || '');
        if (hint) setObjective(hint);
        const start = this.elapsed;
        let reminded = false;
        await this.until(() => {
          const w = this.elapsed - start;
          if (!reminded && w > 90 && hint) { reminded = true; setObjective(hint + '  (E 로 확인)'); }
          if (w > 240) v.set(node.wait.flag, '1');
          return v.truthy(node.wait.flag);
        });
        setObjective(null);
        term.showCenter('새 기록 1건', '자리에 앉아 확인하십시오');
        this.termSfx('sfx_beep_new', 0.6);
        if (!this.seat.seated) {
          await this.sleep(2.2);
          if (!this.seat.seated) setObjective('모니터에 새 기록이 도착했다. 자리로 돌아가자.');
        }
        await this.waitSeated();
        setObjective(null);
      }
      id = st.resolveNext(node, v);
    }
  }

  // ---------- 추격 (임시 외형: 빙글빙글 도는 고양이) ----------
  runChase() {
    return new Promise((resolve) => {
      const reg = this.reg;
      const spawn = this.anchorPos('CatSpawn');
      const cat = buildCat(this.mats, reg.root, spawn.x, -spawn.z);
      const voice = app.audio.loop3D('sfx_cat', cat.root, 0.75, 1.5, 16);
      const door = this.anchorPos('FrontDoor');
      const U = (vec) => [vec.x, -vec.z]; // three → 배치 좌표
      const trail = [[U(door)[0], U(door)[1] - 0.3], [U(door)[0], U(door)[1] + 0.8], U(this.p.pos)];
      const exitIt = reg.its.get('ExitDoor');
      const ch = { cat, voice, trail, wait: 4.2, t: 0, speed: 2.6, done: false, resolve };
      ch.finish = (escaped) => {
        if (ch.done) return; ch.done = true;
        app.audio.fadeLoop(voice, 0.1);
        exitIt?.removeOwner(ch);
        this.p.move = this.p.look = false;
        if (escaped) app.audio.playAt('sfx_door_open', this.anchorPos('ExitDoor'), 0.7, 10); else app.audio.play2D('sfx_catch', 0.5);
        this.chase = null;
        resolve(escaped);
      };
      exitIt?.add('비상구로 나간다', () => !ch.done && ch.wait <= 0, () => ch.finish(true), 50, ch);
      const dir = new THREE.Vector3().subVectors(this.p.pos, spawn).setY(0);
      cat.root.rotation.y = Math.atan2(-dir.x, -dir.z);
      this.chase = ch;
    });
  }

  updateChase(dt) {
    const ch = this.chase; if (!ch || ch.done) return;
    const grid = this.reg.grid;
    const pU = [this.p.pos.x, -this.p.pos.z];
    const last = ch.trail[ch.trail.length - 1];
    if (Math.hypot(pU[0] - last[0], pU[1] - last[1]) > 0.3) ch.trail.push(pU);
    ch.cat.visual.rotation.y += 820 * D * dt;
    ch.cat.visual.position.y = Math.abs(Math.sin(app.time * 9)) * 0.06;
    const exit = this.anchorPos('ExitPoint');
    if (Math.hypot(this.p.pos.x - exit.x, this.p.pos.z - exit.z) < 1.15) { ch.finish(true); return; }
    if (ch.wait > 0) { ch.wait -= dt; return; }
    ch.t += dt;
    ch.speed = 2.6 + (4.1 - 2.6) * Math.min(1, ch.t / 12);
    const c = ch.cat.root.position;
    const cU = [c.x, -c.z];
    let target;
    if (grid.lineFree(cU[0], cU[1], pU[0], pU[1], 0.22)) { target = pU; ch.trail = [pU]; }
    else {
      while (ch.trail.length > 1 && Math.hypot(ch.trail[0][0] - cU[0], ch.trail[0][1] - cU[1]) < 0.3) ch.trail.shift();
      for (let i = Math.min(ch.trail.length - 1, 12); i > 0; i--) { if (grid.lineFree(cU[0], cU[1], ch.trail[i][0], ch.trail[i][1], 0.22)) { ch.trail.splice(0, i); break; } }
      target = ch.trail[0] || pU;
    }
    const dx = target[0] - cU[0], dz = target[1] - cU[1], dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      const s = Math.min(dist, ch.speed * dt);
      c.x += (dx / dist) * s; c.z -= (dz / dist) * s;
    }
    if (Math.hypot(this.p.pos.x - c.x, this.p.pos.z - c.z) < 0.85) ch.finish(false);
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    this.elapsed = (this.elapsed || 0) + dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.r(); } }
    for (let i = this.waiters.length - 1; i >= 0; i--) { const w = this.waiters[i]; if (w.pred()) { this.waiters.splice(i, 1); w.r(); } }
    const reg = this.reg;
    for (const l of reg.ceiling) l.update(dt);
    for (const d of reg.doors.values()) d.update(dt);
    for (const m of reg.dead) m.update(dt, app.time);
    reg.cctvMonitor?.update(dt, app.time);
    for (const dr of reg.drawers.values()) {
      const target = dr.closedZ + (dr.open ? 0.28 : 0);
      dr.obj.position.z += Math.sign(target - dr.obj.position.z) * Math.min(Math.abs(target - dr.obj.position.z), dt * 0.4);
    }
    if (this.fog.t < 1) { this.fog.t = Math.min(1, this.fog.t + dt / this.fog.dur); this.scene.fog.density = this.fog.from + (this.fog.to - this.fog.from) * this.fog.t; }
    this.updateClock(dt);
    this.updateCctv(dt);
    this.updatePlayer(dt);
    this.updateChase(dt);
    this.term.update(dt, app.time);
    this.updateAvatar();
    if (this.playerObj) this.playerObj.position.copy(this.p.pos).setY(1.2);
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
      const target = this.p.pos.clone().setY(1.2);
      const before = c.head.quaternion.clone();
      const m = new THREE.Matrix4().lookAt(target, c.head.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 1, 0));
      const want = new THREE.Quaternion().setFromRotationMatrix(m);
      c.head.quaternion.rotateTowards(want, 35 * D * dt);
      c.servoCd -= dt;
      if (before.angleTo(c.head.quaternion) > 0.003 && c.servoCd <= 0) { c.servoCd = 2.5; app.audio.playAt('sfx_servo', c.root.getWorldPosition(new THREE.Vector3()), 0.35, 12); }
    }
    const f = this.cctvFeed;
    if (f) {
      f.t -= dt;
      if (f.t <= 0) {
        f.t = 1 / 12;
        const scr = this.reg.cctvMonitor.mesh;
        scr.visible = false;
        app.renderer.setRenderTarget(f.rt);
        app.renderer.render(this.scene, f.cam);
        app.renderer.setRenderTarget(null);
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
      const to = seat.dir > 0 ? { pos: this.seatView.pos, quat: this.seatView.quat } : this.headPose();
      cam.position.lerpVectors(seat.from.pos, to.pos, e);
      cam.quaternion.slerpQuaternions(seat.from.quat, to.quat, e);
      if (seat.trans >= 1) {
        if (seat.dir > 0) { seat.seated = true; this.term.acceptInput = true; this.vars.set('sat_once', '1'); if (this.vars.get('objective_seat') === '1') { this.vars.remove('objective_seat'); setObjective(null); } }
        else this.finishStand();
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
    // 이동
    let fx = 0, fz = 0;
    if (p.move) {
      const k = keys;
      const z = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      let len = Math.hypot(x, z);
      if (len > 0) {
        p.sprint = (k.ShiftLeft || k.ShiftRight) && z > 0;
        const sp = (p.sprint ? SPRINT : WALK) / Math.max(1, len);
        const fwd = [-Math.sin(p.yaw), -Math.cos(p.yaw)], right = [Math.cos(p.yaw), -Math.sin(p.yaw)];
        fx = (fwd[0] * z + right[0] * x) * sp; fz = (fwd[1] * z + right[1] * x) * sp;
      } else p.sprint = false;
    }
    const ox = p.pos.x, oz = p.pos.z;
    const nx = ox + fx * dt, nz = oz + fz * dt;
    if (grid.circleFree(nx, -oz, RADIUS)) p.pos.x = nx;
    if (grid.circleFree(p.pos.x, -nz, RADIUS)) p.pos.z = nz;
    const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
    p.moving = moved / Math.max(dt, 1e-4) > 0.3;
    if (p.moving) {
      p.stepAcc += moved;
      if (p.stepAcc >= (p.sprint ? 0.95 : 0.68)) { p.stepAcc = 0; app.audio.step(Math.abs(p.pos.z) > 5.05, p.sprint); }
      p.bob += dt * (p.sprint ? 13 : 8.5);
    } else p.stepAcc = 0.5;
    const amp = p.moving ? (p.sprint ? 0.035 : 0.018) : 0;
    p.bobY = (p.bobY || 0) + (Math.abs(Math.sin(p.bob)) * amp - (p.bobY || 0)) * Math.min(1, dt * 10);
    const pose = this.headPose();
    cam.position.copy(pose.pos);
    cam.quaternion.copy(pose.quat);
    // 상호작용 대상 찾기
    this.current = null;
    let prompt = null;
    if (p.move && app.phase === 'play' && !app.paused) {
      this.ray.setFromCamera(new THREE.Vector2(0, 0), cam);
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
function bindInput() {
  const canvas = app.renderer.domElement;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    const s = app.session;
    if (e.code === 'Escape') { onEscape(); return; }
    if (!s || app.paused || app.phase !== 'play' || !$('confirm').hidden) return;
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
    if (!s || app.phase !== 'play' || app.paused) return;
    if (!app.locked) { tryLock(); }
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
  window.addEventListener('wheel', (e) => { const s = app.session; if (s && s.seat.seated) s.term.scroll(e.deltaY < 0 ? 1 : -1); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const was = app.locked;
    app.locked = document.pointerLockElement === canvas;
    const s = app.session;
    if (was && !app.locked && s && app.phase === 'play' && !app.paused && $('confirm').hidden && $('settings').hidden) {
      if (s.seat.seated) s.stand(false);
      else if (!s.seat.dir) pause();
    }
    $('clickhint').hidden = !(app.phase === 'play' && !app.locked && !app.paused && s && !s.seat.seated && $('confirm').hidden);
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
  if (!$('settings').hidden) { closeSettings(); return; }
  if (app.phase !== 'play') return;
  if (!$('confirm').hidden) { hideConfirm(); s.p.move = s.p.look = true; return; }
  if (app.paused) { resume(); return; }
  if (s.seat.seated) { s.stand(false); return; }
  if (!s.seat.dir) pause();
}

// ---------- HUD ----------
let monoQueue = [], monoTimer = 0, monoSkip = false, objectiveAge = 0, captionT = 0, helpT = 0, flashV = 0;
function setPrompt(text) { const el = $('prompt'); const t = text ? '[E]  ' + text : ''; if (el.textContent !== t) el.textContent = t; $('ring').hidden = !text; }
function setCrosshair(on) { $('dot').hidden = !on; if (!on) { setPrompt(null); } }
function setObjective(text) { $('objective').textContent = text || ''; objectiveAge = 0; }
function monologue(lines) { monoQueue.push(...lines.filter(Boolean)); if (monoTimer <= 0) nextMono(); }
function nextMono() {
  const el = $('mono');
  if (!monoQueue.length) { el.textContent = ''; el.style.opacity = 0; monoTimer = 0; return; }
  const l = monoQueue.shift(); el.textContent = l; el.style.opacity = 1; monoTimer = 2.4 + l.length * 0.06;
}
function advanceMonologue() { if (monoTimer > 0 && monoQueue.length) monoSkip = true; }
function caption(text) { $('caption').textContent = '(' + text + ')'; captionT = 3.5; }
function help(text, t) { $('help').textContent = text; helpT = t; }
function flash(v) { flashV = Math.max(flashV, v); }
function updateHud(dt) {
  if (monoTimer > 0) { monoTimer -= dt; if (monoSkip || monoTimer <= 0) { monoSkip = false; nextMono(); } else if (monoTimer < 0.4) $('mono').style.opacity = Math.max(0, monoTimer / 0.4); }
  objectiveAge += dt; $('objective').style.opacity = objectiveAge < 6 ? 1 : Math.max(0.55, 1 - (objectiveAge - 6) / 3 * 0.45);
  if (captionT > 0) { captionT -= dt; $('caption').style.opacity = Math.min(1, captionT / 0.6); if (captionT <= 0) $('caption').textContent = ''; }
  if (helpT > 0) { helpT -= dt; $('help').style.opacity = Math.min(1, helpT / 0.6); if (helpT <= 0) $('help').textContent = ''; }
  flashV = Math.max(0, flashV - dt * 3);
}

let fadeV = 0, fadeTarget = 0, fadeSpeed = 1;
function fadeTo(v, t) { fadeTarget = v; fadeSpeed = 1 / Math.max(0.01, t); return new Promise((r) => { const chk = () => (Math.abs(fadeV - fadeTarget) < 0.001 ? r() : setTimeout(chk, 30)); chk(); }); }
function setFade(v) { fadeV = fadeTarget = v; }

// ---------- 흐름 ----------
function newSession(vars) {
  if (app.session) app.session.dispose();
  app.session = new Session(vars);
  app.scene = app.session.scene;
  setObjective(null); setPrompt(null); monoQueue = []; nextMono();
}

function showTitle() {
  app.phase = 'title';
  const s = app.session;
  s.p.move = s.p.look = false;
  setCrosshair(false);
  setFade(1); fadeTo(0, 1.5);
  app.audio.setMusic('title');
  $('endcount').textContent = `엔딩 ${endingsFound()} / ${ENDING_COUNT}`;
  $('title').hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}

async function startGame() {
  $('title').hidden = true;
  app.phase = 'intro';
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
  s.vars.set('objective_seat', '1');
  setObjective('자리로 가서 컴퓨터를 켜자. (모니터 불빛이 보이는 책상)');
  help('WASD 이동 · 마우스 시점 · E 상호작용 / 앉기·일어나기 · ESC 메뉴', 10);
  s.runStory(app.story.start).catch((e) => console.error(e));
  $('clickhint').hidden = app.locked;
}

function restart() {
  hidePause();
  app.paused = false; app.audio.suspend(false);
  newSession(null);
  app.audio.stopLayers(); app.audio.startLayers();
  (async () => { setFade(1); app.phase = 'intro'; tryLock(); await playIntro(); beginPlay(); $('intro').hidden = true; await fadeTo(0, 1.4); })();
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
  s.term.clearBody(); s.term.showCenter('연결 종료', '');
  app.phase = 'play';
  tryLock();
  setFade(1); fadeTo(0, 1.2);
  s.runStory(app.story.chaseRetry || app.story.start).catch((e) => console.error(e));
}

function askLeave() {
  const s = app.session; if (app.phase !== 'play') return;
  s.p.move = s.p.look = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('confirmq').textContent = '근무를 마치지 않고 퇴근할까?';
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
  s.p.move = s.p.look = false;
  if (s.chase && !s.chase.done) { s.chase.done = true; app.audio.fadeLoop(s.chase.voice, 0.1); }
  setCrosshair(false); setObjective(null);
  store.set('end_' + e.number, 1);
  app.audio.silenceAll();
  await fadeTo(1, e.bad ? 0.6 : 2.0);
  app.audio.stopAllLoops();
  app.audio.setMusic('ending');
  if (document.pointerLockElement) document.exitPointerLock();
  const box = $('ending');
  $('endnum').textContent = ''; $('endtitle').textContent = ''; $('endbody').textContent = '';
  $('endbuttons').hidden = true;
  box.hidden = false; box.style.opacity = 0;
  for (let a = 0; a <= 1; a += 0.04) { box.style.opacity = a; await sleepMs(50); }
  box.style.opacity = 1;
  await sleepMs(800);
  $('endnum').textContent = 'ENDING ' + e.number + (e.bad ? '  ·  BAD END' : '');
  await sleepMs(900);
  $('endtitle').textContent = e.title;
  await sleepMs(1500);
  let skip = false;
  const onSkip = () => { skip = true; };
  window.addEventListener('mousedown', onSkip);
  for (const l of app.story.visibleLines(e.lines, s.vars)) {
    const p = document.createElement('p'); p.textContent = s.vars.format(l.text); $('endbody').appendChild(p);
    const until = performance.now() + 1600 + l.text.length * 35;
    skip = false;
    while (performance.now() < until && !skip) await sleepMs(30);
  }
  window.removeEventListener('mousedown', onSkip);
  await sleepMs(600);
  $('retry').hidden = !e.retryChase;
  $('endbuttons').hidden = false;
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

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

function openSettings() {
  $('settings').hidden = false;
  for (const k of ['brightness', 'master', 'music', 'sens']) { $('set_' + k).value = Math.round(settings[k] * 100); $('val_' + k).textContent = Math.round(settings[k] * 100) + '%'; }
}
function closeSettings() { $('settings').hidden = true; saveSettings(); }
function applySettings() { app.audio.masterVol = settings.master; app.audio.musicVol = settings.music; app.audio.applyVolumes(); }

// ---------- 루프 ----------
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(app.maxDt || 0.05, app.clock.getDelta());
  app.time += dt;
  const s = app.session;
  fadeV += Math.sign(fadeTarget - fadeV) * Math.min(Math.abs(fadeTarget - fadeV), fadeSpeed * dt);
  if (!s) return;
  if (!app.paused) {
    if (app.phase === 'title' || app.phase === 'gate' || app.phase === 'intro') {
      if (app.phase !== 'intro') {
        const t = app.time, tc = s.reg.titleCam;
        const pos = new THREE.Vector3(tc.pos[0] + Math.sin(t * 0.07) * 0.25, tc.pos[1] + Math.sin(t * 0.11) * 0.05, -(tc.pos[2] + Math.cos(t * 0.05) * 0.15));
        app.camera.position.copy(pos);
        app.camera.lookAt(tc.look[0], tc.look[1], -tc.look[2]);
      }
      s.term.update(dt, app.time);
      for (const l of s.reg.ceiling) l.update(dt);
    } else s.update(dt);
    app.audio.update(dt);
  }
  app.audio.listener(app.camera);
  updateHud(dt);
  // 렌더
  const pm = app.postMat.uniforms;
  const b = settings.brightness, tn = s.tension || 0;
  pm.exposure.value = 0.8 + 1.2 * b; pm.gammaV.value = 1.2 - 0.48 * b;
  pm.vignette.value = 0.55 + tn * 0.08; pm.grain.value = 0.035 + tn * 0.012; pm.chroma.value = 0.012 + tn * 0.006; pm.desat.value = 0.25 + tn * 0.06;
  pm.flash.value = flashV; pm.fade.value = fadeV; pm.time.value = app.time;
  const sz = app.renderer.getDrawingBufferSize(new THREE.Vector2());
  pm.resolution.value.copy(sz);
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
  $('titlesettings').onclick = () => openSettings();
  $('resume').onclick = () => resume();
  $('pausesettings').onclick = () => openSettings();
  $('restart').onclick = () => restart();
  $('totitle').onclick = () => toTitle();
  $('closesettings').onclick = () => closeSettings();
  $('endtotitle').onclick = () => toTitle();
  $('retry').onclick = () => retryChase();
  for (const k of ['brightness', 'master', 'music', 'sens']) {
    $('set_' + k).addEventListener('input', (e) => { settings[k] = e.target.value / 100; $('val_' + k).textContent = e.target.value + '%'; applySettings(); });
  }
  document.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => app.audio.ctx && app.audio.play2D('sfx_ui_hover', 0.3)));
  // 자동 확인용 (개발자 검사): 주소 끝에 #autotest
  if (location.hash === '#autotest') window.__ne = { app, triggerEnding, startGame, beginPlay };
}

wire();
boot();
