// scripts/anim-upload-server.mjs — dev-only sink for the retarget harness.
// Receives POST /save?name=mocap-<arch>.glb and writes into public/assets/anims/.
// Run: node scripts/anim-upload-server.mjs   (stop with ctrl-c when done)
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/assets/anims', { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
  if (req.method !== 'POST' || !/^mocap-[a-z]+\.glb$/.test(name)) {
    res.statusCode = 400; res.end('bad request'); return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    writeFileSync(`public/assets/anims/${name}`, buf);
    console.log(`saved ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
    res.end('ok');
  });
}).listen(5199, () => console.log('anim upload sink on http://localhost:5199'));
