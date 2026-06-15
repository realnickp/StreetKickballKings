// Find genuinely African-American / New York male announcer voices.
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const H = { 'xi-api-key': key };

async function search(params) {
  const qs = new URLSearchParams({ page_size: '30', ...params });
  const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${qs}`, { headers: H });
  if (!r.ok) { console.log('  fail', r.status); return []; }
  return (await r.json()).voices ?? [];
}
const seen = new Set();
const show = (vs, tag) => {
  for (const v of vs) {
    if (seen.has(v.voice_id)) continue; seen.add(v.voice_id);
    const l = v.labels || {};
    const desc = (v.description || l.descriptive || '').toString().slice(0, 70);
    console.log(`[${tag}] ${(v.name||'').padEnd(22)} ${v.voice_id}  ${l.gender||'?'}/${l.accent||'?'}/${l.age||''}  use=${v.use_case||l.use_case||''}  "${desc}"`);
  }
};
for (const q of [
  { gender:'male', search:'african american' },
  { gender:'male', search:'new york' },
  { gender:'male', search:'black american deep' },
  { gender:'male', accent:'american', search:'hype sports announcer energetic' },
  { gender:'male', search:'detroit chicago atlanta rapper' },
]) {
  console.log(`\n=== ${JSON.stringify(q)} ===`);
  show(await search(q), q.search.split(' ')[0]);
}
