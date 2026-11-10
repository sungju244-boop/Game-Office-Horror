// 여러 모듈이 함께 쓰는 상태·설정·저장·화면(HUD) 도우미.
import { THREE } from './kit.js';
import { AudioSys } from './audio.js';
import { t, getLang } from './i18n.js';

export const $ = (id) => document.getElementById(id);
export const ENDING_COUNT = 6;
export const EYE = 1.62, RADIUS = 0.3, WALK = 2.3, SPRINT = 4.9, REACH = 2.3, FOV = 62;
export const UNCLE_SPEED = WALK / 4; // 겁쟁이 모드 아저씨: 플레이어 걷기 속도의 1/4
export const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const PARK_Y = -60;

// ---------- 저장 (이 브라우저에만) ----------
export const store = {
  get(k, d) { try { const v = localStorage.getItem('ne2_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ne2_' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
  del(k) { try { localStorage.removeItem('ne2_' + k); } catch (e) { /* */ } },
};
const old = (k, d) => { try { const v = localStorage.getItem('ne_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
export const settings = {
  brightness: store.get('brightness', old('brightness', 0.5)), master: store.get('master', old('master', 0.8)),
  music: store.get('music', old('music', 0.7)), sens: store.get('sens', old('sens', 0.45)),
  lang: store.get('lang', old('lang', /^ko/i.test(navigator.language || 'ko') ? 'ko' : 'en')),
  chicken: !!store.get('chicken', old('chicken', false)),
};
export const saveSettings = () => { for (const k of Object.keys(settings)) store.set(k, settings[k]); };
export const endingsFound = () => { let n = 0; for (let i = 1; i <= ENDING_COUNT; i++) if (store.get('end_' + i, 0)) n++; return n; };

/** 자동 저장: 챕터 시작마다(챕터 선택용) + 로그 선택 직전마다(직전 선택부터). 마지막 것은 이어하기용. */
export const saves = {
  last: () => store.get('save_last', null),
  choice: () => store.get('save_choice', null),
  chapter: (id) => store.get('save_ch_' + id, null),
  reached: () => store.get('chapters_reached', []),
  put(kind, node, vars, chapter) {
    const snap = { node, vars: vars.toJSON(), chapter: chapter || '', at: Date.now() };
    if (kind === 'chapter') {
      store.set('save_ch_' + chapter, snap);
      const r = saves.reached(); if (!r.includes(chapter)) { r.push(chapter); store.set('chapters_reached', r); }
    }
    if (kind === 'choice') store.set('save_choice', snap);
    store.set('save_last', snap);
  },
};

// ---------- 전역 ----------
export const app = {
  renderer: null, camera: null, rt: null, postMat: null, postScene: null, postCam: null,
  rawStory: null, dictEn: null, story: null, layoutJson: null, textures: new Map(), images: new Map(), models: new Map(), audio: new AudioSys(), session: null,
  phase: 'loading', paused: false, frozen: false, chaseSnapshot: null, clock: new THREE.Clock(), time: 0, locked: false, maxDt: 0.05, fps: 0, noAdapt: false,
  flow: {}, // game.js 가 채운다: triggerEnding, finishEnding, toTitle …
};
export const keys = {};

// ---------- 화면 도우미 ----------
let monoQueue = [], monoTimer = 0, monoSkip = false, objectiveAge = 0, captionT = 0, helpT = 0, jsT = 0, cardT = 0;
export const fx = { flash: 0, shakeA: 0, shakeT: 0, shakeDur: 1, fade: 0, fadeTarget: 0, fadeSpeed: 1, tint: 0 };
export function setPrompt(text) { const el = $('prompt'); const s = text ? '[E]  ' + text : ''; if (el.textContent !== s) el.textContent = s; $('ring').hidden = !text; }
export function setCrosshair(on) { $('dot').hidden = !on; if (!on) setPrompt(null); }
export function setObjective(text) { $('objective').textContent = text || ''; objectiveAge = 0; }
export function monologue(lines) { monoQueue.push(...lines.filter(Boolean)); if (monoTimer <= 0) nextMono(); }
export function clearMonologue() { monoQueue = []; nextMono(); }
function nextMono() {
  const el = $('mono');
  if (!monoQueue.length) { el.textContent = ''; el.style.opacity = 0; monoTimer = 0; return; }
  const l = monoQueue.shift(); el.textContent = l; el.style.opacity = 1; monoTimer = 2.4 + l.length * 0.06;
}
export function advanceMonologue() { if (monoTimer > 0 && monoQueue.length) monoSkip = true; }
export function caption(text) { $('caption').textContent = '(' + text + ')'; captionT = 3.5; }
export function help(text, tt) { $('help').textContent = text; helpT = tt; }
export function flash(v) { fx.flash = Math.max(fx.flash, v * (REDUCED ? 0.4 : 1)); }
export function shake(amp, dur) { fx.shakeA = amp * (REDUCED ? 0.25 : 1); fx.shakeT = fx.shakeDur = dur; }
export function countdown(n) {
  const el = $('countdown');
  if (n == null) { el.hidden = true; return; }
  $('cdlabel').textContent = t('countdown');
  const num = $('cdnum');
  num.textContent = String(n);
  el.hidden = false;
  num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
}
/** 전체 화면 깜짝 그림. kind: 'sup'(감독관) | 'ent'(그것) | 'uncle'(아저씨) */
export function jumpscare(kind, dur) {
  const el = $('jumpscare');
  el.className = kind;
  for (const im of el.querySelectorAll('img')) { im.style.animation = 'none'; void im.offsetWidth; im.style.animation = ''; }
  el.hidden = false;
  jsT = dur;
}
export function hideJumpscare() { $('jumpscare').hidden = true; jsT = 0; }
export function fadeTo(v, tt) { fx.fadeTarget = v; fx.fadeSpeed = 1 / Math.max(0.01, tt); return new Promise((r) => { const chk = () => (Math.abs(fx.fade - fx.fadeTarget) < 0.001 ? r() : setTimeout(chk, 30)); chk(); }); }
export function setFade(v) { fx.fade = fx.fadeTarget = v; }
/** 자리에 없을 때 보여 주는 장 제목 카드 (화면 오버레이) */
export function chapterCard(time, label, title, dur = 2.8) {
  $('cctime').textContent = time; $('cclabel').textContent = label; $('cctitle').textContent = title;
  const el = $('chcard'); el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  cardT = dur;
}
/** 종이 문서 (프린터 출력물 등). 닫히면 resolve */
let docResolve = null;
export function showDoc(lines) {
  const box = $('docbody'); box.textContent = '';
  for (const l of lines) { const p = document.createElement('p'); p.textContent = l; box.appendChild(p); }
  $('doc').hidden = false;
  return new Promise((r) => { docResolve = r; });
}
export function docOpen() { return !$('doc').hidden; }
export function closeDoc() { if ($('doc').hidden) return; $('doc').hidden = true; const r = docResolve; docResolve = null; r?.(); }
export function updateHud(dt) {
  if (monoTimer > 0) { monoTimer -= dt; if (monoSkip || monoTimer <= 0) { monoSkip = false; nextMono(); } else if (monoTimer < 0.4) $('mono').style.opacity = Math.max(0, monoTimer / 0.4); }
  objectiveAge += dt; $('objective').style.opacity = objectiveAge < 6 ? 1 : Math.max(0.55, 1 - (objectiveAge - 6) / 3 * 0.45);
  if (captionT > 0) { captionT -= dt; $('caption').style.opacity = Math.min(1, captionT / 0.6); if (captionT <= 0) $('caption').textContent = ''; }
  if (helpT > 0) { helpT -= dt; $('help').style.opacity = Math.min(1, helpT / 0.6); if (helpT <= 0) $('help').textContent = ''; }
  if (jsT > 0) { jsT -= dt; if (jsT <= 0) hideJumpscare(); }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) $('chcard').hidden = true; }
  fx.flash = Math.max(0, fx.flash - dt * 3);
}
export function updateBadge() { $('chickenbadge').hidden = !(settings.chicken && (app.phase === 'play' || app.phase === 'intro')); }
export const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
export const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
export { t, getLang };
