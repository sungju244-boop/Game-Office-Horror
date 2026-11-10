// 야간 평가실 — 브라우저판 (리부트). 이야기·배치·소리·텍스처는 Unity 프로젝트와 같은 데이터.
import { THREE, D, postMaterial, crtCurve } from './kit.js';
import { parseJsonc, localize, Vars, Story } from './story.js';
import { Session } from './session.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { TERM_W, TERM_H } from './terminal.js';
import { t, setLang, getLang, applyDom } from './i18n.js';
import {
  $, app, settings, saveSettings, store, saves, keys, endingsFound, ENDING_COUNT, FOV, PARK_Y,
  setPrompt, setCrosshair, setObjective, clearMonologue, advanceMonologue, help, countdown, hideJumpscare,
  fx, fadeTo, setFade, updateHud, updateBadge, docOpen, closeDoc, sleepMs, flash,
} from './shared.js';

const TEX = ['carpet', 'floor_tile', 'ceiling_tile', 'wall', 'desk_top', 'metal', 'plastic', 'fabric', 'cardboard', 'door',
  'keyboard', 'tower_front', 'notice', 'badge117', 'badge116', 'sticky', 'clock_face', 'sign_room', 'panel', 'calendar', 'elevator',
  'exit_sign', 'window_night', 'screen_117', 'screen_face', 'monster_skin', 'note116', 'void_floor', 'rack_front',
  'sign_server', 'sign_manager', 'sign_meeting', 'sign_staff', 'uncle_face',
  'notice_en', 'badge117_en', 'badge116_en', 'sticky_en', 'sign_room_en', 'panel_en', 'calendar_en', 'exit_sign_en', 'screen_117_en',
  'note116_en', 'sign_server_en', 'sign_manager_en', 'sign_meeting_en', 'sign_staff_en'];
const IMAGES = ['reflect_face'];
const _sz = new THREE.Vector2();
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
    await Promise.all(IMAGES.map((n) => new Promise((res) => { const im = new Image(); im.onload = () => { app.images.set(n, im); res(); }; im.onerror = () => res(); im.src = `tex/${n}.png`; })));
    await Promise.all([...document.querySelectorAll('#jumpscare img')].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
    progress(0.24);
    await loadModels();
    progress(0.3);
    await app.audio.load('audio', (p) => progress(0.3 + p * 0.65));
    try { app.audio.makePanner(1, 1, true); } catch (e) { /* 입체 음향(HRTF) 미리 준비 */ }
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

/** CC0 형체 모델 (web/models: Tools/prep_models.sh 로 만든 GLB + 뼈 이름표). 실패하면 예전 형체를 쓴다 */
async function loadModels() {
  app.models = new Map();
  const gl = new GLTFLoader();
  await Promise.all(['ent', 'sup', 'tp'].map(async (k) => {
    try {
      const [g, bones] = await Promise.all([gl.loadAsync(`models/${k}.glb`), fetch(`models/${k}.bones.json`).then((r) => r.json())]);
      app.models.set(k, { scene: g.scene, bones });
    } catch (e) { console.warn('모델 로드 실패 (예전 형체로 대신함)', k, e); }
  }));
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
  app.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.03, 70);
  app.camera.layers.enable(3); // 천장 (위에서 내려다보는 추격 화면에서만 끈다)
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
  const active = (app.phase === 'play' || app.phase === 'title') && !app.paused && !document.hidden && !app.noAdapt && !app.frozen;
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

// ---------- 입력 ----------
const modalOpen = () => !$('chickenwarn').hidden || !$('album').hidden || !$('settings').hidden || !$('chapters').hidden || docOpen() || !$('freeze').hidden;
function bindInput() {
  const canvas = app.renderer.domElement;
  window.addEventListener('keydown', (e) => {
    const s = app.session;
    if (typerActive()) { if (e.code === 'Escape') e.preventDefault(); return; }
    keys[e.code] = true;
    if (e.code === 'Escape') { onEscape(); return; }
    if (docOpen() && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) { closeDoc(); e.preventDefault(); return; }
    if (!s || app.paused || app.phase !== 'play' || modalOpen()) return;
    if (e.code === 'KeyE') {
      if (s.seat.seated) s.stand(false);
      else if (!s.seat.dir && !s.focus) s.interact();
      advanceMonologue();
    }
    if ((e.code === 'Space' || e.code === 'Enter') && s.seat.seated) { s.term.click(null, null); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', (e) => {
    const s = app.session;
    if (app.phase === 'title') { titleIdleReset(); return; }
    if (!s || app.phase !== 'play' || app.paused || modalOpen()) return;
    if (!app.locked) tryLock();
    if (e.button !== 0) return;
    if (s.seat.seated) {
      if (s.term.input) { focusTyper(); return; }
      const pt = app.locked ? [s.term.cursor.x, s.term.cursor.y] : screenToTerm(e.clientX, e.clientY);
      if (!app.locked && pt && s.term.maze) s.term.pointer(pt[0], pt[1]);
      s.term.click(pt ? pt[0] : null, pt ? pt[1] : null);
    } else advanceMonologue();
  });
  window.addEventListener('mousemove', (e) => {
    const s = app.session;
    if (app.phase === 'title') { titleIdleReset(); return; }
    if (!s || app.phase !== 'play' || app.paused || app.frozen) return;
    if (s.seat.seated) {
      if (app.locked) s.term.pointerDelta(e.movementX, e.movementY, 1.5);
      else {
        const pt = screenToTerm(e.clientX, e.clientY);
        if (pt) s.term.pointer(pt[0], pt[1]); else if (!s.term.maze) s.term.pointer(null);
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
    if (was && !app.locked && s && app.phase === 'play' && !app.paused && !modalOpen() && !app.frozen && !typerActive()) {
      if (s.seat.seated) { if (!s.term.maze && !s.term.input) s.stand(false); }
      else if (!s.seat.dir && !s.focus) pause();
    }
    updateClickHint();
  });
  $('clickhint').addEventListener('click', () => tryLock());
  // 단말기 명령 입력 (한글 입력기 포함): 숨은 입력창
  const ty = $('typer');
  ty.addEventListener('input', () => app.session?.term.setInputValue(ty.value));
  ty.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); app.session?.term.submitInput(); ty.value = ''; }
  });
  ty.addEventListener('blur', () => { if (app.session?.term.input) setTimeout(focusTyper, 50); });
  $('doc').addEventListener('click', () => closeDoc());
}
function typerActive() { return document.activeElement === $('typer'); }
function focusTyper() { const ty = $('typer'); ty.value = ''; ty.focus({ preventScroll: true }); }
function updateClickHint() {
  const s = app.session;
  $('clickhint').hidden = !(app.phase === 'play' && !app.locked && !app.paused && s && !s.seat.seated && !modalOpen() && !app.frozen);
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
  if (docOpen()) { closeDoc(); return; }
  if (!$('chickenwarn').hidden) { $('chickenno').click(); return; }
  if (!$('settings').hidden) { closeSettings(); return; }
  if (!$('album').hidden) { closeAlbum(); return; }
  if (!$('chapters').hidden) { closeChapters(); return; }
  if (app.phase === 'replay') { if (!$('endbuttons').hidden) closeReplay(); return; }
  if (app.phase !== 'play' || app.frozen) return;
  if (app.paused) { resume(); return; }
  if (s.seat.seated) { if (!s.term.maze && !s.term.input) s.stand(false); return; }
  if (!s.seat.dir && !s.focus) pause();
}

// ---------- 흐름 ----------
function newSession(vars) {
  if (app.session) app.session.dispose();
  app.session = new Session(vars);
  setObjective(null); setPrompt(null); clearMonologue();
  countdown(null); hideJumpscare();
}

function refreshTitle() {
  const n = endingsFound();
  $('endcount').textContent = t('endCount', { n, t: ENDING_COUNT });
  $('albumbtn').hidden = n === 0;
  $('albumnew').hidden = !(n > store.get('album_seen', 0));
  $('continue').hidden = !saves.last();
  $('chapterbtn').hidden = saves.reached().length === 0;
  $('chickenbtn').textContent = `${t('chicken')}: ${settings.chicken ? t('on') : t('off')}`;
  $('chickennote').hidden = !settings.chicken;
  $('chickennote').textContent = t('chickenNote');
  $('langbtn').textContent = t('language');
}

function showTitle(toast) {
  app.phase = 'title';
  const s = app.session;
  s.p.move = s.p.look = false;
  setCrosshair(false); updateBadge(); countdown(null);
  setFade(1); fadeTo(0, 1.5);
  app.audio.setMusic('title');
  refreshTitle();
  $('title').hidden = false;
  $('titletoast').textContent = toast || '';
  $('titletoast').hidden = !toast;
  app.renderer.shadowMap.needsUpdate = true;
  if (document.pointerLockElement) document.exitPointerLock();
  titleIdleReset(true);
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
  if (!skip) await wait(2200);
  window.removeEventListener('mousedown', onSkip);
  window.removeEventListener('keydown', onSkip);
}

/** 처음부터: 엘리베이터 홀에서 시작 */
function beginPlay() {
  const s = app.session;
  const sp = s.reg.spawn;
  s.p.pos.set(sp.x, 0, -sp.z); s.p.yaw = -sp.yaw * D; s.p.pitch = 0;
  s.p.move = s.p.look = true;
  setCrosshair(true);
  app.audio.setMusic('game'); app.audio.setTension(0);
  app.phase = 'play';
  updateBadge();
  setObjective(t('objSeat'));
  s.setWaypoint('Computer', '117', 0); // 처음엔 바로 자리 방향을 보여 준다
  help(t('help'), 10);
  app.flow.onSeated = () => { if ($('objective').textContent === t('objSeat')) setObjective(null); };
  s.runStory(app.story.start).catch((e) => console.error(e));
  updateClickHint();
}

/** 저장된 지점부터 (이어하기·챕터 선택·직전 선택부터): 자리 옆에 서서 시작 */
async function resumeFrom(snap, opts = {}) {
  if (!snap) { restart(); return; }
  hideAllScreens();
  app.paused = false; app.audio.suspend(false);
  setFade(1);
  newSession(Vars.from(snap.vars));
  app.audio.stopLayers(); app.audio.startLayers();
  const s = app.session, ds = s.reg.deskStand;
  s.p.pos.set(ds.x, 0, -ds.z); s.p.yaw = -ds.yaw * D; s.p.pitch = 0;
  s.p.move = s.p.look = true; setCrosshair(true);
  // 들어온 뒤라면 출입문은 잠겨 있다
  if (s.vars.truthy('entered')) s.reg.doors.get('FrontDoor')?.setLocked(true);
  s.vars.set('entered', '1');
  const crack = s.vars.num('crack'); if (crack) s.term.setCrack(crack);
  app.audio.setMusic('game'); app.audio.setTension(s.vars.num('tension'));
  app.phase = 'play';
  updateBadge();
  tryLock();
  setObjective(t('objBack'));
  s.setWaypoint('Computer', '117', 0);
  app.flow.onSeated = () => { if ($('objective').textContent === t('objBack')) setObjective(null); };
  s.runStory(snap.node).catch((e) => console.error(e));
  updateClickHint();
  await fadeTo(0, 1.2);
}

function restart() {
  hideAllScreens();
  app.paused = false; app.audio.suspend(false);
  newSession(null);
  app.audio.stopLayers(); app.audio.startLayers();
  (async () => { setFade(1); app.phase = 'intro'; updateBadge(); tryLock(); await playIntro(); beginPlay(); $('intro').hidden = true; await fadeTo(0, 1.4); })();
}

function toTitle(toast) {
  hideAllScreens();
  app.paused = false; app.audio.suspend(false);
  newSession(null);
  app.audio.stopLayers(); app.audio.startLayers();
  showTitle(toast);
}

function hideAllScreens() { for (const id of ['pause', 'ending', 'chapters', 'title', 'album', 'freeze', 'cctvhud']) $(id).hidden = true; closeDoc(); }

function retryChase() {
  const snap = app.chaseSnapshot;
  if (!snap) { restart(); return; }
  resumeFrom({ node: snap.node, vars: snap.vars.toJSON() });
}

function triggerEnding(id) {
  if (app.phase === 'ending') return;
  const e = app.story.endings.get(id); if (!e) { console.error('엔딩 없음', id); return; }
  endingRoutine(e);
}

/** 엔딩을 기록한다 (앨범) */
function recordEnding(e, s) {
  const before = endingsFound();
  store.set('end_' + e.number, 1);
  store.set('endvars_' + e.number, s.vars.toJSON());
  return before;
}

async function endingRoutine(e) {
  const s = app.session;
  app.phase = 'ending';
  if (app.paused) resume();
  s.alive = false;
  s.cancelScare();
  s.p.move = s.p.look = false;
  if (s.chase && !s.chase.done) { s.chase.done = true; s.stopChaseAudio(s.chase); }
  setCrosshair(false); setObjective(null); updateBadge();
  const lines = app.story.visibleLines(e.lines, s.vars).map((l) => s.vars.format(l.text));
  const before = recordEnding(e, s);
  app.audio.silenceAll();
  await fadeTo(1, e.bad ? 0.6 : 2.0);
  app.audio.stopAllLoops();
  app.audio.setMusic('ending');
  if (document.pointerLockElement) document.exitPointerLock();
  await presentEnding(e, lines, false);
  if (before === 0) $('endnote').textContent = t('firstEnd');
}

/** 엔딩 3 처럼 엔딩 화면 없이 바로 타이틀로 가는 경우 */
function finishEnding(id, opts = {}) {
  const e = app.story.endings.get(id); if (!e) return;
  const s = app.session;
  s.alive = false;
  recordEnding(e, s);
  if (opts.toTitle) toTitle(t('endToast', { n: e.number, title: e.title }));
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
  $('endfromchoice').hidden = replay || !saves.choice();
  $('retry').hidden = replay || !e.retryChase || !app.chaseSnapshot;
  $('endchapters').hidden = replay || saves.reached().length === 0;
  $('endrestart').hidden = replay;
  $('endtotitle').hidden = replay;
  $('endclose').hidden = !replay;
  $('endbuttons').hidden = false;
}

// ---------- 챕터 선택 ----------
function openChapters() {
  const grid = $('chaptergrid'); grid.textContent = '';
  const reached = new Set(saves.reached());
  for (const ch of app.story.chapters) {
    const ok = reached.has(ch.id) && !!saves.chapter(ch.id);
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'chcardbtn' + (ok ? '' : ' locked'); card.disabled = !ok;
    const tm = document.createElement('div'); tm.className = 'cht'; tm.textContent = ok ? ch.time : '--:--';
    const lb = document.createElement('div'); lb.className = 'chl'; lb.textContent = ch.label;
    const tt = document.createElement('div'); tt.className = 'chn'; tt.textContent = ok ? ch.title : t('locked');
    card.append(tm, lb, tt);
    if (ok) card.onclick = () => { app.audio.play2D('sfx_ui_select', 0.4); $('chapters').hidden = true; $('title').hidden = true; $('ending').hidden = true; resumeFrom(saves.chapter(ch.id)); };
    grid.appendChild(card);
  }
  $('chapters').hidden = false;
}
function closeChapters() { $('chapters').hidden = true; }

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
      const v = Vars.from(store.get('endvars_' + e.number, null));
      const first = app.story.visibleLines(e.lines, v)[0];
      if (first) add('desc', v.format(first.text));
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
  const v = Vars.from(store.get('endvars_' + e.number, null));
  await presentEnding(e, app.story.visibleLines(e.lines, v).map((l) => v.format(l.text)), true);
}
function closeReplay() { $('ending').hidden = true; showTitle(); openAlbum(); }

// ---------- 가짜 브라우저 멈춤 ----------
async function fakeFreeze() {
  const s = app.session;
  app.frozen = true;
  app.audio.play2D('sfx_freeze', 0.6);
  await sleepMs(250);
  app.audio.suspend(true);
  await sleepMs(1600);
  if (document.pointerLockElement) document.exitPointerLock();
  $('freeze').hidden = false;
  await new Promise((r) => {
    $('fzwait').onclick = () => r('wait');
    $('fzkill').onclick = () => r('kill');
  }).then(async (how) => {
    $('freeze').hidden = true;
    if (how === 'kill') { setFade(1); await sleepMs(900); setFade(0); }
  });
  app.audio.suspend(false);
  app.frozen = false;
  if (s.term.mascot) { s.term.mascot.on = true; s.term.mascot.distort = 0.25; }
  tryLock();
}

// ---------- 타이틀 대기 연출: 지지직 → 화면 끄트머리에 약 1초 ----------
const idle = { t: 0, next: 30, busy: false };
function titleIdleReset(full = false) { idle.t = 0; if (full) idle.next = 30; }
async function titleApparition() {
  const s = app.session; if (!s || idle.busy) return;
  idle.busy = true;
  const e1 = store.get('end_1', 0), e2 = store.get('end_2', 0);
  let kind = 'shadow';
  if (settings.chicken) kind = 'uncle';
  else if (e1 && e2) kind = Math.random() < 0.5 ? 'ent' : 'sup';
  else if (e1) kind = 'ent';
  else if (e2) kind = 'sup';
  const tc = s.reg.titleCam, cam = app.camera;
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const side = Math.random() < 0.5 ? -1 : 1;
  let pos = null;
  for (const d of [5.5, 6.5, 4.5, 7.5]) {
    for (const k of [0.62, 0.55, 0.7]) {
      const p = cam.position.clone().addScaledVector(fwd, d).addScaledVector(right, side * d * k * (cam.aspect / 1.78));
      if (s.reg.grid.circleFree(p.x, -p.z, 0.32)) { pos = p.setY(0); break; }
    }
    if (pos) break;
  }
  if (pos) {
    flash(0.25); app.audio.play2D('sfx_static_2', kind === 'uncle' ? 0.15 : 0.3);
    const yaw = Math.atan2(-(cam.position.x - pos.x), -(cam.position.z - pos.z));
    const f = s.showFig(kind === 'sup' ? 'sup' : 'ent', pos, yaw, { glow: 0.7 });
    if (kind === 'shadow') s.entity.setEyes(0);
    await sleepMs(kind === 'uncle' ? 1400 : 1000);
    flash(0.2); app.audio.play2D('sfx_static_1', 0.2);
    s.hideFig(kind === 'sup' ? 'sup' : 'ent');
  }
  idle.next = 60 + Math.random() * 60;
  idle.t = 0; idle.busy = false;
}

// ---------- 겁쟁이 모드 · 언어 ----------
function requestChicken(on) {
  if (!on) { setChicken(false); return; }
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
  newSession(null);
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
  $('pause').hidden = true;
  tryLock();
  updateClickHint();
}

function refreshSettings() { $('set_chicken').textContent = settings.chicken ? t('on') : t('off'); }
function openSettings() {
  $('settings').hidden = false;
  for (const k of ['brightness', 'master', 'music', 'sens']) { $('set_' + k).value = Math.round(settings[k] * 100); $('val_' + k).textContent = Math.round(settings[k] * 100) + '%'; }
  refreshSettings();
}
function closeSettings() { $('settings').hidden = true; saveSettings(); }
function applySettings() { app.audio.masterVol = settings.master; app.audio.musicVol = settings.music; app.audio.applyVolumes(); }

/** 길 안내 표시: 목표 방향과 거리. 화면 밖이면 가장자리 화살표 */
const _wp = new THREE.Vector3(), _wd = new THREE.Vector3();
function updateWaypoint(s) {
  const el = $('waypoint');
  const w = s.wp;
  const show = app.phase === 'play' && w && s.elapsed >= w.at && s.standing() && !s.topdown && !s.chase && !app.paused && !s.ending;
  if (!show) { if (!el.hidden) el.hidden = true; return; }
  const target = s.anchorPos(w.id);
  const cam = app.camera;
  const dist = Math.hypot(target.x - s.p.pos.x, target.z - s.p.pos.z);
  if (dist < 1.6) { el.hidden = true; return; }
  _wp.copy(target).project(cam);
  cam.getWorldDirection(_wd);
  const behind = _wd.dot(_wp.copy(target).sub(cam.position)) < 0;
  _wp.copy(target).project(cam);
  let x = _wp.x, y = _wp.y, edge = false;
  if (behind) { x = -x; y = -y; }
  const m = Math.max(Math.abs(x), Math.abs(y));
  if (behind || m > 0.82) { x = (x / m) * 0.82; y = (y / m) * 0.82; edge = true; }
  el.hidden = false;
  el.classList.toggle('edge', edge);
  $('wplabel').textContent = w.label;
  $('wpdist').textContent = Math.round(dist) + 'm';
  el.style.left = ((x + 1) / 2 * window.innerWidth) + 'px';
  el.style.top = ((1 - y) / 2 * window.innerHeight) + 'px';
  $('wparrow').style.transform = `rotate(${Math.atan2(-y, x) * 180 / Math.PI + 90}deg)`;
}

/** 위에서 내려다보는 추격 화면: 시각과 비상구 표시 (화면 밖이면 가장자리에) */
const _ep = new THREE.Vector3();
function updateCctvHud(s) {
  $('cctvtime').textContent = s.vars.get('clock') + ':' + String(Math.floor(app.time) % 60).padStart(2, '0');
  const ex = s.anchorPos('ExitPoint');
  _ep.copy(ex).setY(0.5).project(app.camera);
  let x = _ep.x, y = _ep.y;
  const m = Math.max(Math.abs(x), Math.abs(y));
  if (m > 0.86) { x = (x / m) * 0.86; y = (y / m) * 0.86; }
  const el = $('exitmark');
  el.style.left = ((x + 1) / 2 * window.innerWidth) + 'px';
  el.style.top = ((1 - y) / 2 * window.innerHeight) + 'px';
  // CCTV 추적 상자: 나(초록)와 쫓아오는 것(빨강)
  const box = (id, pos, show) => {
    const b = $(id); b.hidden = !show; if (!show) return;
    _ep.copy(pos).setY(1.0).project(app.camera);
    b.style.left = ((_ep.x + 1) / 2 * window.innerWidth) + 'px';
    b.style.top = ((1 - _ep.y) / 2 * window.innerHeight) + 'px';
  };
  box('trkme', s.p.pos, true);
  const ch = s.chase;
  box('trksup', ch ? ch.pos : s.p.pos, !!(ch && ch.shown && Math.abs(_ep.copy(ch.pos).setY(1).project(app.camera).x) < 1.05 && Math.abs(_ep.y) < 1.05));
}

// ---------- 루프 ----------
function frame() {
  requestAnimationFrame(frame);
  const raw = app.clock.getDelta();
  const dt = Math.min(app.maxDt, raw) * (app.timeScale || 1); // timeScale: 자동 검사에서만 바꾼다
  if (app.frozen) return; // 가짜 멈춤: 마지막 화면 그대로
  app.time += dt;
  const s = app.session;
  fx.fade += Math.sign(fx.fadeTarget - fx.fade) * Math.min(Math.abs(fx.fadeTarget - fx.fade), fx.fadeSpeed * dt);
  if (!s) return;
  if (!app.paused) {
    if (app.phase === 'play') { s.update(dt); if (s.topdown) updateCctvHud(s); updateWaypoint(s); }
    else if (app.phase === 'title' || app.phase === 'gate') {
      const tt = app.time, tc = s.reg.titleCam;
      app.camera.position.set(tc.pos[0] + Math.sin(tt * 0.07) * 0.25, tc.pos[1] + Math.sin(tt * 0.11) * 0.05, -(tc.pos[2] + Math.cos(tt * 0.05) * 0.15));
      app.camera.lookAt(tc.look[0], tc.look[1], -tc.look[2]);
      s.term.update(dt, app.time);
      s.updateLights(dt);
      for (const f of s.figs.values()) s.poseFig(f, dt);
      if (app.phase === 'title' && $('album').hidden && $('settings').hidden && $('chapters').hidden && $('chickenwarn').hidden) {
        idle.t += dt;
        if (idle.t >= idle.next) titleApparition();
      }
    }
    app.audio.update(dt);
  }
  app.audio.listener(s.topdown ? s.earObj : app.camera);
  updateHud(dt);
  adaptQuality(raw);
  const covered = app.paused || app.phase === 'replay' || (app.phase === 'intro' && !$('intro').hidden) || (app.phase === 'ending' && fx.fade >= 0.999);
  if (covered) return;
  if (fx.shakeT > 0) {
    fx.shakeT -= dt;
    const k = fx.shakeA * Math.max(0, fx.shakeT / fx.shakeDur);
    app.camera.position.x += (Math.random() * 2 - 1) * k;
    app.camera.position.y += (Math.random() * 2 - 1) * k;
    app.camera.rotateZ((Math.random() * 2 - 1) * k * 0.6);
  }
  const pm = app.postMat.uniforms;
  const b = settings.brightness, ck = s.chicken, tn = ck ? 0 : (s.tension || 0);
  pm.exposure.value = 0.8 + 1.2 * b + (ck ? 0.25 : 0); pm.gammaV.value = 1.2 - 0.48 * b - (ck ? 0.05 : 0);
  pm.vignette.value = (ck ? 0.3 : 0.55) + tn * 0.08; pm.grain.value = (ck ? 0.02 : 0.035) + tn * 0.012;
  pm.chroma.value = 0.012 + tn * 0.006; pm.desat.value = (ck ? 0.05 : 0.25) + tn * 0.06;
  if (s.topdown) { pm.desat.value = 0.75; pm.grain.value = 0.07; pm.vignette.value = 0.6; pm.chroma.value = 0.025; pm.exposure.value += 0.45; }
  pm.flash.value = fx.flash; pm.fade.value = fx.fade; pm.time.value = app.time;
  app.renderer.getDrawingBufferSize(pm.resolution.value);
  app.renderer.setRenderTarget(app.rt);
  app.renderer.render(s.scene, app.camera);
  app.renderer.setRenderTarget(null);
  app.renderer.render(app.postScene, app.postCam);
}

// ---------- 메뉴 연결 ----------
function wire() {
  app.flow = {
    triggerEnding, finishEnding, toTitle, fakeFreeze,
    relock: () => { tryLock(); updateClickHint(); },
    cctvOverlay: (on) => { $('cctvhud').hidden = !on; },
    startTyping: () => { if (document.pointerLockElement) document.exitPointerLock(); focusTyper(); },
    stopTyping: () => { $('typer').blur(); tryLock(); },
  };
  $('gate').addEventListener('click', () => {
    app.audio.resume();
    app.audio.startLayers();
    applySettings();
    $('gate').hidden = true;
    showTitle();
  });
  $('start').onclick = () => { app.audio.play2D('sfx_ui_select', 0.4); startGame(); };
  $('continue').onclick = () => { app.audio.play2D('sfx_ui_select', 0.4); $('title').hidden = true; resumeFrom(saves.last()); };
  $('chapterbtn').onclick = () => openChapters();
  $('closechapters').onclick = () => closeChapters();
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
  $('endrestart').onclick = () => restart();
  $('endfromchoice').onclick = () => resumeFrom(saves.choice());
  $('endchapters').onclick = () => openChapters();
  $('retry').onclick = () => retryChase();
  $('endclose').onclick = () => closeReplay();
  for (const k of ['brightness', 'master', 'music', 'sens']) {
    $('set_' + k).addEventListener('input', (e) => { settings[k] = e.target.value / 100; $('val_' + k).textContent = e.target.value + '%'; applySettings(); });
  }
  let hovered = null;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (b && b !== hovered && app.audio.ctx) app.audio.play2D('sfx_ui_hover', 0.3);
    hovered = b;
  });
  if (location.hash === '#autotest') {
    window.__ne = { app, settings, saves, store, triggerEnding, startGame, beginPlay, setChicken, toggleLanguage, openAlbum, openChapters, endingsFound, resumeFrom, fakeFreeze,
      jump: (id) => app.session.jump(id), scare: (kind) => app.session.scare({ kind }) };
  }
}

wire();
boot();
