// Discover good announcer voices: list account voices + search the shared
// library for urban/American, energetic male (and female) hype voices.
// Run: node scripts/eleven-voices.mjs
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('NO KEY'); process.exit(1); }
const H = { 'xi-api-key': key };

// 1) account voices
const acc = await (await fetch('https://api.elevenlabs.io/v1/voices', { headers: H })).json();
console.log(`\n=== ACCOUNT VOICES (${acc.voices?.length ?? 0}) ===`);
for (const v of acc.voices ?? []) {
  console.log(`  ${v.name.padEnd(16)} ${v.voice_id}  ${v.labels?.gender ?? '?'}/${v.labels?.accent ?? '?'}/${v.labels?.descriptive ?? v.labels?.description ?? ''}`);
}

// 2) shared library search — American, energetic, for both genders
async function search(params) {
  const qs = new URLSearchParams({ page_size: '24', ...params });
  const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${qs}`, { headers: H });
  if (!r.ok) { console.log('  shared search failed', r.status, (await r.text()).slice(0, 160)); return []; }
  return (await r.json()).voices ?? [];
}

for (const q of [
  { gender: 'male', accent: 'american', search: 'energetic announcer' },
  { gender: 'male', accent: 'american', search: 'hype sports' },
  { gender: 'male', search: 'urban' },
  { gender: 'female', accent: 'american', search: 'energetic' },
]) {
  console.log(`\n=== SHARED: ${JSON.stringify(q)} ===`);
  const vs = await search(q);
  for (const v of vs.slice(0, 12)) {
    const l = v.labels || {};
    console.log(`  ${(v.name||'').padEnd(18)} ${v.voice_id}  ${l.gender||'?'}/${l.accent||'?'}/${l.age||''}/${l.descriptive||l.description||''}  uses=${(v.use_case||l.use_case||'')}`);
  }
}
