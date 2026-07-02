// scripts/anim-upload-server.mjs — dev-only sink for the bake harnesses.
// Receives POST /save?name=mocap-<arch>.glb | world-<name>.glb and writes into
// public/assets/{anims,world}/. Run: node scripts/anim-upload-server.mjs
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
  if (req.method !== 'POST' || !/^(mocap|world)-[a-z]+\.glb$/.test(name)) {
    res.statusCode = 400; res.end('bad request'); return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    const dir = name.startsWith('world-') ? 'public/assets/world' : 'public/assets/anims';
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}`, buf);
    console.log(`saved ${dir}/${name} (${(buf.length / 1024).toFixed(0)} KB)`);
    res.end('ok');
  });
}).listen(5199, () => console.log('bake upload sink on http://localhost:5199'));
