// Start the Vite dev server and run a harness against it in ONE process, so a
// single command (and a single foreground job) covers both. Kills the server
// when the harness exits. Usage: PORT=5191 node scripts/with-dev.mjs scripts/gameover-e2e.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [,, script, ...rest] = process.argv;
const port = process.env.PORT ?? '5190';
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
vite.stdout.on('data', () => {});
vite.stderr.on('data', (d) => process.stderr.write('[vite] ' + d));
const t0 = Date.now();
while (!ready && Date.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 300)); try { const r = await fetch(`http://localhost:${port}/`); ready = r.ok; } catch { /* not yet */ } }
if (!ready) { console.log('vite never came up'); vite.kill(); process.exit(2); }
console.log(`[with-dev] vite up on :${port} in ${Date.now() - t0} ms`);
const child = spawn(process.execPath, [script, ...rest], { cwd: root, stdio: 'inherit', env: { ...process.env, SKK_URL: `http://localhost:${port}` } });
const code = await new Promise((res) => child.on('exit', res));
vite.kill();
try { spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* fine */ }
process.exit(code ?? 1);
