"""VRM(0.x) 파일에서 휴머노이드 뼈 이름표와 텍스처 크기를 뽑는다.
사용: python3 -I Tools/vrm_info.py model.vrm [out.json]
glTF-Transform 이 VRM 확장을 지우기 때문에, 뼈 이름표(humanBones → 노드 이름)를 따로 저장해 둔다."""
import json, struct, sys

def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<4sII', b, 0)
    assert magic == b'glTF', 'not a GLB'
    off, js, binc = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', b, off)
        chunk = b[off + 8:off + 8 + clen]
        if ctype == b'JSON': js = json.loads(chunk)
        elif ctype == b'BIN\x00': binc = chunk
        off += 8 + clen
    return js, binc

def png_size(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n': return struct.unpack('>II', data[16:24])
    if data[:2] == b'\xff\xd8':
        i = 2
        while i < len(data):
            if data[i] != 0xFF: i += 1; continue
            m = data[i + 1]
            if m in (0xC0, 0xC2): return struct.unpack('>HH', data[i + 5:i + 9])[::-1]
            i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    return None

js, binc = read_glb(sys.argv[1])
vrm = js.get('extensions', {}).get('VRM', {})
bones = {hb['bone']: js['nodes'][hb['node']].get('name', '') for hb in vrm.get('humanoid', {}).get('humanBones', [])}
texs = []
for im in js.get('images', []):
    if 'bufferView' in im:
        bv = js['bufferViews'][im['bufferView']]
        data = binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        texs.append((im.get('name', ''), png_size(data), bv['byteLength']))
print('meshes', len(js.get('meshes', [])), 'materials', len(js.get('materials', [])), 'skins', len(js.get('skins', [])))
for t in texs: print('  tex', t)
print('  bones', len(bones), {k: bones[k] for k in ('hips', 'head', 'leftUpperArm') if k in bones})
if len(sys.argv) > 2:
    json.dump(bones, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
