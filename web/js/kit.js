// three.js 도우미. 배치 데이터(office_layout.json)와 Unity 판은 왼손 좌표(z+ = 북쪽)라서
// three.js(오른손)에서는 z 를 뒤집어 쓴다: Unity (x, y, z) → three (x, y, -z), 회전 x·y 각도는 부호 반대.
import * as THREE from '../vendor/three.module.min.js';

export { THREE };
export const D = Math.PI / 180;

export function place(obj, lp = [0, 0, 0], euler = [0, 0, 0]) {
  obj.position.set(lp[0], lp[1], -lp[2]);
  obj.rotation.set(-euler[0] * D, -euler[1] * D, euler[2] * D, 'YXZ');
  return obj;
}

export function boxGeo(sx, sy, sz, uvWorld = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (uvWorld > 0) {
    const uv = g.attributes.uv;
    const s = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (uv.getX(i) * s[f][0]) / uvWorld, (uv.getY(i) * s[f][1]) / uvWorld);
      }
    }
  }
  return g;
}

/** 앞(+z)에서 뒤(-z)로 좁아지는 CRT 뒤통수 */
export function frustumGeo(front, back, depth, drop) {
  const g = boxGeo(front[0], front[1], depth, 0.5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) {
      p.setX(i, (p.getX(i) * back[0]) / front[0]);
      p.setY(i, (p.getY(i) * back[1]) / front[1] - drop);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** 늘어진 케이블 점들 (Unity 좌표) */
export function sag(a, b, s, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - s * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
}

export function tubeGeo(ptsUnity, radius) {
  const pts = ptsUnity.map((p) => new THREE.Vector3(p[0], p[1], -p[2]));
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, Math.max(6, pts.length * 3), radius, 5, false);
}

/** 정적 메시들을 재질별로 합쳐 그리기 호출을 줄인다 */
export function mergeStatic(root, scene) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.dynamic || !o.visible) return;
    let p = o.parent;
    while (p) { if (p.userData.dynamic) return; p = p.parent; }
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [], cast: false });
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const grp = groups.get(key);
    grp.geos.push(g);
    grp.cast = grp.cast || o.castShadow;
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const out = new THREE.Group();
  out.name = 'Merged';
  for (const { mat, geos, cast } of groups.values()) {
    const merged = mergeGeos(geos);
    geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    out.add(m);
  }
  scene.add(out);
  return out;
}

function mergeGeos(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo; io += a.length; }
    else { for (let k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (!m.userData?.shared) m.dispose(); }
    }
  });
}

// ---------- CRT 화면 셰이더 (Unity NightEvalCRT.shader 와 같은 효과) ----------
const CRT_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const CRT_FRAG = `
uniform sampler2D map; uniform vec3 tint; uniform float brightness, glitch, power, curve, noiseAmt, time, lines;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec2 crtCurve(vec2 uv){ vec2 c = uv*2.0-1.0; c *= 1.0 + curve*dot(c,c); return c*0.5+0.5; }
void main(){
  float t = time;
  vec2 uv = crtCurve(vUv);
  float p = clamp(power,0.0,1.0);
  float squeeze = mix(0.004, 1.0, clamp(p*1.25,0.0,1.0));
  uv.y = (uv.y-0.5)/squeeze + 0.5;
  float g = clamp(glitch,0.0,1.0);
  float band = floor(uv.y*28.0);
  float tick = floor(t*14.0);
  float r = hash(vec2(band,tick));
  float shift = (r > 1.0 - g*0.7) ? (hash(vec2(band+3.1,tick))-0.5)*0.16*g : 0.0;
  uv.x += shift + sin(t*37.0 + uv.y*9.0)*0.004*g;
  uv.y += (hash(vec2(tick,7.7))-0.5)*0.02*g*step(0.82, hash(vec2(tick,1.3)));
  float inside = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
  float ca = 0.0012 + g*0.012;
  vec3 col;
  col.r = texture2D(map, uv+vec2(ca,0.0)).r;
  col.g = texture2D(map, uv).g;
  col.b = texture2D(map, uv-vec2(ca,0.0)).b;
  float scan = 0.80 + 0.20*sin(uv.y*lines*3.14159);
  float roll = 0.94 + 0.06*sin((uv.y + t*0.07)*6.2831);
  col *= scan*roll;
  float n = hash(floor(uv*vec2(512.0,384.0)) + fract(t*3.7)*91.0);
  col += (n-0.5)*(noiseAmt + g*0.35);
  col *= 0.965 + 0.035*sin(t*59.0);
  vec2 d = vUv-0.5;
  float vig = clamp(1.0 - dot(d,d)*1.7, 0.0, 1.0);
  col = max(col, 0.0)*tint*brightness*vig*inside;
  col += vec3(0.008,0.012,0.016)*inside;
  col += vec3(0.6,0.8,1.0)*(1.0 - smoothstep(0.0,0.02,abs(vUv.y-0.5)))*clamp(1.0-p,0.0,1.0)*step(0.02,p);
  col *= clamp(p*4.0,0.0,1.0)*0.98 + 0.02;
  gl_FragColor = vec4(col, 1.0);
}`;

export function crtMaterial(tex, tint = [0.8, 0.92, 1.0], brightness = 1.35, power = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      tint: { value: new THREE.Color(tint[0], tint[1], tint[2]) },
      brightness: { value: brightness },
      glitch: { value: 0 },
      power: { value: power },
      curve: { value: 0.06 },
      noiseAmt: { value: 0.03 },
      time: { value: 0 },
      lines: { value: 384 },
    },
    vertexShader: CRT_VERT,
    fragmentShader: CRT_FRAG,
  });
}

export function crtCurve(u, v, k = 0.06) {
  let cx = u * 2 - 1, cy = v * 2 - 1;
  const m = 1 + k * (cx * cx + cy * cy);
  cx *= m; cy *= m;
  return [cx * 0.5 + 0.5, cy * 0.5 + 0.5];
}

// ---------- 후처리 (Unity NightEvalPostFX.shader 와 같은 효과) ----------
export function postMaterial(rtTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rtTexture },
      exposure: { value: 1.4 }, gammaV: { value: 0.96 }, vignette: { value: 0.55 }, grain: { value: 0.035 },
      chroma: { value: 0.012 }, flash: { value: 0 }, desat: { value: 0.25 }, fade: { value: 0 }, time: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
uniform sampler2D tDiffuse; uniform float exposure, gammaV, vignette, grain, chroma, flash, desat, fade, time; uniform vec2 resolution;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv; vec2 d = uv-0.5; float ca = chroma*dot(d,d);
  vec3 c;
  c.r = texture2D(tDiffuse, uv - d*ca).r;
  c.g = texture2D(tDiffuse, uv).g;
  c.b = texture2D(tDiffuse, uv + d*ca).b;
  c *= exposure;
  c = pow(max(c, 0.0), vec3(gammaV));
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(c, vec3(l), desat) * vec3(0.9,0.97,1.08);
  c *= mix(1.0, clamp(1.0 - dot(d,d)*2.0, 0.0, 1.0), vignette);
  float n = hash(uv*resolution + fract(time*7.13)*61.7) - 0.5;
  c += n*grain;
  float band = step(0.7, hash(vec2(floor(uv.y*40.0), floor(time*20.0))));
  c = mix(c, vec3(0.55,0.68,0.75)*(0.4+n), flash*band);
  c *= (1.0 - fade);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
  });
}
