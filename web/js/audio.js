// WebAudio 재생: 음악 층(긴장도), 환경음, 3D 위치 효과음. 소리는 Unity 판과 같은 합성 음원.
export const CLIPS = [
  'amb_hum', 'amb_fan', 'amb_crt', 'amb_room', 'amb_draft',
  'mus_drone', 'mus_tension', 'mus_title', 'mus_chase', 'mus_ending',
  'sfx_step_carpet_1', 'sfx_step_carpet_2', 'sfx_step_carpet_3', 'sfx_step_carpet_4',
  'sfx_step_tile_1', 'sfx_step_tile_2', 'sfx_step_tile_3', 'sfx_step_tile_4',
  'sfx_click', 'sfx_blip', 'sfx_ui_hover', 'sfx_ui_select', 'sfx_beep', 'sfx_beep_new', 'sfx_check',
  'sfx_static_1', 'sfx_static_2', 'sfx_static_3', 'sfx_door_creak', 'sfx_door_open', 'sfx_door_close',
  'sfx_door_locked', 'sfx_lock', 'sfx_unlock', 'sfx_drawer', 'sfx_window', 'sfx_phone', 'sfx_radio',
  'sfx_elevator', 'sfx_footsteps_far', 'sfx_power_down', 'sfx_crt_on', 'sfx_crt_off', 'sfx_servo', 'sfx_cat', 'sfx_catch',
  'mon_breath', 'mon_static', 'mon_step_1', 'mon_step_2', 'mon_step_3', 'mon_drag', 'mon_roar', 'js_shriek', 'js_stinger',
  'sfx_door_bang', 'sfx_heartbeat', 'mus_hunt', 'mus_cute', 'mus_cute_chase', 'sfx_boing', 'sfx_tick',
];

export class AudioSys {
  constructor() {
    this.ctx = null; this.buf = new Map(); this.layers = new Map(); this.loops = new Set();
    this.musicVol = 0.7; this.masterVol = 0.8; this.music = 'none'; this.tension = 0;
    this.chicken = false; this.duckV = 1; this.duckTarget = 1;
  }

  async load(base, onProgress) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    let done = 0;
    await Promise.all(CLIPS.map(async (n) => {
      try {
        const r = await fetch(`${base}/${n}.ogg`);
        const ab = await r.arrayBuffer();
        this.buf.set(n, await this.ctx.decodeAudioData(ab));
      } catch (e) { console.warn('오디오 로드 실패', n, e); }
      done++; onProgress?.(done / CLIPS.length);
    }));
    this.applyVolumes();
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  suspend(p) { if (!this.ctx) return; if (p) this.ctx.suspend(); else this.ctx.resume(); }
  applyVolumes() { if (!this.master) return; this.master.gain.value = this.masterVol; this.musicBus.gain.value = this.musicVol; }

  startLayers() {
    const defs = [['title', 'mus_title', true], ['drone', 'mus_drone', true], ['tension', 'mus_tension', true], ['chase', 'mus_chase', true],
      ['hunt', 'mus_hunt', true], ['cute', 'mus_cute', true], ['cutechase', 'mus_cute_chase', true],
      ['hum', 'amb_hum', false], ['room', 'amb_room', false], ['heart', 'sfx_heartbeat', false]];
    for (const [id, clip, music] of defs) {
      if (this.layers.has(id)) continue;
      const b = this.buf.get(clip); if (!b) continue;
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(music ? this.musicBus : this.sfxBus); src.start();
      this.layers.set(id, { src, g, target: 0, speed: 0.6 });
    }
    this.target('room', 0.35); this.target('hum', 0.22);
  }
  target(id, v, speed = 0.6) { const l = this.layers.get(id); if (l) { l.target = v; l.speed = speed; } }

  setMusic(mode) {
    this.music = mode;
    for (const id of ['title', 'drone', 'tension', 'chase', 'hunt', 'cute', 'cutechase', 'heart']) this.target(id, 0, 0.8);
    if (mode === 'title') this.target(this.chicken ? 'cute' : 'title', 0.55);
    else if (mode === 'game') this.applyTension();
    else if (mode === 'chase') {
      if (this.chicken) this.target('cutechase', 0.6, 3);
      else { this.target('hunt', 0.62, 3); this.target('tension', 0.12); this.target('heart', 0.5, 1); }
    } else if (mode === 'ending') {
      this.target('hum', 0, 2); this.target('room', 0.12, 2);
      this.play2D('mus_ending', 0.6, true);
    }
  }
  setChicken(on) { this.chicken = !!on; if (this.music !== 'ending') this.setMusic(this.music); }
  duck(on) { this.duckTarget = on ? 0.12 : 1; }
  setTension(level) { this.tension = Math.max(0, Math.min(3, level)); if (this.music === 'game') this.applyTension(); }
  applyTension() {
    if (this.chicken) { this.target('cute', 0.45, 0.5); this.target('drone', 0); this.target('tension', 0); return; }
    this.target('cute', 0, 0.8);
    const drone = [0.42, 0.42, 0.36, 0.26], tens = [0, 0.16, 0.36, 0.55];
    this.target('drone', drone[this.tension], 0.25); this.target('tension', tens[this.tension], 0.25);
  }
  setHum(on, time) { this.target('hum', on ? 0.22 : 0, 0.22 / Math.max(0.05, time)); }
  silenceAll() { for (const l of this.layers.values()) { l.target = 0; l.speed = 2; } }

  update(dt) {
    this.duckV += Math.sign(this.duckTarget - this.duckV) * Math.min(Math.abs(this.duckTarget - this.duckV), dt * (this.duckTarget < this.duckV ? 1.2 : 2.5));
    if (this.musicBus) this.musicBus.gain.value = this.musicVol * this.duckV;
    for (const [id, l] of this.layers) {
      const tgt = (id === 'hum' || id === 'room') ? l.target * this.duckV : l.target;
      const v = l.g.gain.value, d = tgt - v;
      l.g.gain.value = v + Math.sign(d) * Math.min(Math.abs(d), Math.max(l.speed, this.duckTarget < 1 ? 1.5 : 0) * dt);
    }
    for (const lp of this.loops) {
      if (lp.follow && lp.panner) {
        lp.follow.getWorldPosition(this._v || (this._v = lp.follow.position.clone()));
        this.setPos(lp.panner, this._v);
      }
    }
  }

  listener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = p.clone()));
    const u = this._u || (this._u = p.clone());
    u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }

  setPos(panner, v) {
    if (panner.positionX) { const t = this.ctx.currentTime; panner.positionX.setValueAtTime(v.x, t); panner.positionY.setValueAtTime(v.y, t); panner.positionZ.setValueAtTime(v.z, t); }
    else panner.setPosition(v.x, v.y, v.z);
  }

  makePanner(range, minD = 1, hrtf = false) {
    const p = this.ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear'; p.refDistance = minD; p.maxDistance = range; p.rolloffFactor = 1;
    return p;
  }

  play2D(name, vol = 1, music = false, rate = 1) {
    const b = this.buf.get(name); if (!b || !this.ctx) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(music ? this.musicBus : this.sfxBus); s.start();
    return s;
  }

  playAt(name, pos, vol = 1, range = 18, jitter = 0.04) {
    const b = this.buf.get(name); if (!b || !this.ctx) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.makePanner(range); this.setPos(p, pos);
    s.connect(g); g.connect(p); p.connect(this.sfxBus); s.start();
    return s;
  }

  loop3D(name, follow, vol, minD, range, hrtf = false) {
    const b = this.buf.get(name); if (!b || !this.ctx) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.makePanner(range, minD, hrtf);
    s.connect(g); g.connect(p); p.connect(this.sfxBus);
    s.start(0, Math.random() * b.duration * 0.9);
    const lp = { src: s, gain: g, panner: p, follow };
    this.loops.add(lp);
    follow.updateWorldMatrix(true, false);
    this.setPos(p, follow.getWorldPosition(follow.position.clone()));
    return lp;
  }

  fadeLoop(lp, time, stop = true) {
    if (!lp) return;
    const t = this.ctx.currentTime;
    lp.gain.gain.cancelScheduledValues(t);
    lp.gain.gain.setValueAtTime(lp.gain.gain.value, t);
    lp.gain.gain.linearRampToValueAtTime(0, t + time);
    if (stop) { try { lp.src.stop(t + time + 0.05); } catch (e) { /* 이미 멈춤 */ } this.loops.delete(lp); }
  }
  setLoopVol(lp, v) { if (lp) { const t = this.ctx.currentTime; lp.gain.gain.cancelScheduledValues(t); lp.gain.gain.setValueAtTime(v, t); } }

  stopAllLoops() { for (const lp of [...this.loops]) this.fadeLoop(lp, 0.2); }
  stopLayers() { for (const l of this.layers.values()) { try { l.src.stop(); } catch (e) { /* */ } } this.layers.clear(); }

  step(tile, sprint) {
    const n = 1 + ((Math.random() * 4) | 0);
    this.play2D((tile ? 'sfx_step_tile_' : 'sfx_step_carpet_') + n, (tile ? 0.42 : 0.3) * (sprint ? 1.3 : 1));
  }
}
