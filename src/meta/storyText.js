// Story-script placeholders. Scenes are written once and filled at play time
// with YOUR crew's name and whoever's across the court. Unknown tokens stay as
// written so a typo shows up on screen instead of vanishing.

export const TOKENS = ['crew', 'captain', 'rival', 'recruit', 'city', 'rivalLogo', 'crewLogo'];

export function fillText(text, vars = {}) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) =>
    TOKENS.includes(k) && vars[k] != null && vars[k] !== '' ? String(vars[k]) : m);
}
