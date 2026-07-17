import { describe, it, expect } from 'vitest';
import { ELEMENTS } from '../src/game/cityElements.js';
import fieldsData from '../src/data/fields.json';

const EXPECTED = {
  'blacktop': 'el-train',
  'subway-yard': 'steam-vents',
  'block-party': 'dj-drop',
  'neon-night-court': 'night-hustle',
  'boardwalk-kings': 'sea-breeze',
  'the-underpass': 'motorcade',
  'rubber-yard': 'extra-bounce',
  'winter-classic': 'the-hawk',
  'scorchyard': 'heat-wave',
  'the-crown': 'heavy-air',
};

describe('city element data', () => {
  const fields = fieldsData.fields ?? fieldsData;
  it('every field has its spec-approved element', () => {
    for (const f of fields) expect(f.element, f.id).toBe(EXPECTED[f.id]);
  });
  it('every element id resolves in the registry with label + blurb', () => {
    for (const f of fields) {
      const el = ELEMENTS[f.element];
      expect(el, f.element).toBeTruthy();
      expect(el.label.length).toBeGreaterThan(0);
      expect(el.blurb.length).toBeGreaterThan(0);
    }
  });
});
