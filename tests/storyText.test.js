import { describe, it, expect } from 'vitest';
import { fillText, TOKENS } from '../src/meta/storyText.js';

const vars = { crew: 'EASTSIDE', captain: 'Big Mo', rival: 'Brooklyn Bullies', recruit: 'Rocket', city: 'Brooklyn', rivalLogo: 'assets/logos/bullies.png', crewLogo: 'data:x' };

describe('story text placeholders', () => {
  it('fills every known token', () => {
    expect(fillText('{captain}: {crew} vs {rival} in {city}, {recruit} watching', vars))
      .toBe('Big Mo: EASTSIDE vs Brooklyn Bullies in Brooklyn, Rocket watching');
    expect(fillText('{rivalLogo}', vars)).toBe('assets/logos/bullies.png');
  });
  it('leaves unknown tokens and missing values alone', () => {
    expect(fillText('{nope} {crew}', vars)).toBe('{nope} EASTSIDE');
    expect(fillText('{recruit}', { crew: 'X' })).toBe('{recruit}');
  });
  it('a full var set leaves no braces', () => {
    const all = TOKENS.map((t) => `{${t}}`).join(' ');
    expect(fillText(all, vars)).not.toMatch(/[{}]/);
  });
});
