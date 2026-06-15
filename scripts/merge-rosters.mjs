// One-shot: merge the workflow-generated rosters into teams.json and flip the
// 8 identity-only teams to status:"ready". Run: node scripts/merge-rosters.mjs <outputFile>
import fs from 'fs';

const teamsPath = new URL('../src/data/teams.json', import.meta.url);
const outPath = process.argv[2];
if (!outPath) { console.error('usage: node scripts/merge-rosters.mjs <workflow-output.json>'); process.exit(1); }

const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
const wf = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const rosters = wf.result ?? wf; // accept the raw byId map too

let changed = 0;
for (const t of teams.teams) {
  const r = rosters[t.id];
  if (Array.isArray(r) && r.length === 8 && (!t.roster || t.roster.length === 0)) {
    t.roster = r;
    t.status = 'ready';
    changed++;
  }
}

fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2) + '\n');
const ready = teams.teams.filter((t) => t.status === 'ready').map((t) => t.id);
console.log(`merged ${changed} rosters · ready teams (${ready.length}): ${ready.join(', ')}`);
