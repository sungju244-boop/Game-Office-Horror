"""GLB/VRM 의 표정용 모프 타깃(blendshape)을 지운다. 게임에서는 쓰지 않고 파일 크기의 대부분을 차지한다.
사용: python3 -I Tools/strip_morph.py in.vrm out.glb  (뒤이어 glTF-Transform prune 으로 안 쓰는 데이터를 뺀다)"""
import json, struct, sys

src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
_, ver, length = struct.unpack_from('<4sII', b, 0)
off, chunks = 12, []
while off < length:
    clen, ctype = struct.unpack_from('<I4s', b, off)
    chunks.append([ctype, b[off + 8:off + 8 + clen]])
    off += 8 + clen
js = json.loads(chunks[0][1])
n = 0
for m in js.get('meshes', []):
    for p in m.get('primitives', []):
        if p.pop('targets', None) is not None: n += 1
        p.get('extras', {}).pop('targetNames', None)
    m.pop('weights', None)
    m.get('extras', {}).pop('targetNames', None)
js.get('extensions', {}).pop('VRM', None)
for k in ('extensionsUsed', 'extensionsRequired'):
    if k in js: js[k] = [e for e in js[k] if e != 'VRM'] or js.pop(k)
jb = json.dumps(js, separators=(',', ':')).encode()
jb += b' ' * ((4 - len(jb) % 4) % 4)
chunks[0][1] = jb
body = b''.join(struct.pack('<I4s', len(c), t) + c for t, c in chunks)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body)
print('morph targets removed from', n, 'primitive(s)')
