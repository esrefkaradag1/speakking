import json
import struct
import sys

def parse_glb(filename):
    with open(filename, 'rb') as f:
        magic = f.read(4)
        if magic != b'glTF': return "Not a GLB"
        f.read(8) # version and length
        chunk_len = struct.unpack('<I', f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type != b'JSON': return "No JSON chunk"
        json_data = f.read(chunk_len).decode('utf-8')
        doc = json.loads(json_data)
        targets = set()
        for mesh in doc.get('meshes', []):
            if 'extras' in mesh and 'targetNames' in mesh['extras']:
                targets.update(mesh['extras']['targetNames'])
        return targets

print(parse_glb('public/avatar.glb'))
