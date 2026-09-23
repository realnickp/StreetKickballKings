// Minimal GLB 2.0 container read/write for asset scripts. No dependencies.
const MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;
const pad4 = (n) => (n + 3) & ~3;

export function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    else if (type === CHUNK_BIN) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB without a JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

export function buildGlb(json, bin) {
  const js = Buffer.from(JSON.stringify(json), 'utf8');
  const jsPadded = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]); // JSON pads with spaces
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length, 0)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(MAGIC, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPadded.length + 8 + binPadded.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsPadded.length, 0); jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([head, jh, jsPadded, bh, binPadded]);
}

/**
 * Replace embedded images. `transform(bytes, mimeType, imageIndex)` returns
 * `{ bytes, mimeType }` or null to keep the image. Every bufferView is
 * re-packed 4-byte aligned; textures pointing at a WebP image are routed
 * through EXT_texture_webp (the extension three's GLTFLoader already handles
 * for the 14 newer archetypes). Returns the SAME buffer when nothing changed.
 */
export async function rewriteGlbImages(buf, transform) {
  const { json, bin } = parseGlb(buf);
  const views = (json.bufferViews ?? []).map((bv) => ({ ...bv, bytes: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength) }));
  let changed = 0;
  for (const [i, im] of (json.images ?? []).entries()) {
    if (im.bufferView == null) continue;
    const out = await transform(views[im.bufferView].bytes, im.mimeType, i);
    if (!out) continue;
    views[im.bufferView].bytes = Buffer.from(out.bytes);
    im.mimeType = out.mimeType;
    changed += 1;
  }
  if (!changed) return { buf, changed };
  const parts = [];
  let off = 0;
  for (const v of views) {
    v.byteOffset = off; v.byteLength = v.bytes.length;
    parts.push(v.bytes); off += v.bytes.length;
    const pad = pad4(off) - off;
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  }
  json.bufferViews = views.map(({ bytes, ...rest }) => rest);
  json.buffers = [{ byteLength: off }];
  const webp = new Set((json.images ?? []).map((im, i) => (im.mimeType === 'image/webp' ? i : -1)).filter((i) => i >= 0));
  for (const t of json.textures ?? []) {
    const src = t.source ?? t.extensions?.EXT_texture_webp?.source;
    if (src == null || !webp.has(src)) continue;
    delete t.source;
    t.extensions = { ...(t.extensions ?? {}), EXT_texture_webp: { source: src } };
  }
  if (webp.size) {
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_texture_webp'])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_texture_webp'])];
  }
  return { buf: buildGlb(json, Buffer.concat(parts)), changed };
}
