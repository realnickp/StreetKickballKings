// YOUR crew's mark, in YOUR colour. The twelve stock marks ship as white
// glyphs on transparent; this paints one in a hex (canvas `source-in`) and
// hands back a data URL the <img>s, the logo clash and the jersey decals can
// all use like any crew's logo file. Cached per mark+colour.
import { inkFor } from '../game/kits.js';

const cache = new Map();

export const markFileUrl = (markId) => `assets/logos/stock/${markId}.png`;

export function tintedMarkUrl(markId, hex) {
  const key = `${markId}|${hex}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 512;
          c.height = img.naturalHeight || 512;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, c.width, c.height);
          g.globalCompositeOperation = 'source-in';
          g.fillStyle = hex;
          g.fillRect(0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        } catch { resolve(markFileUrl(markId)); }
      };
      img.onerror = () => resolve(markFileUrl(markId));
      img.src = markFileUrl(markId);
    }));
  }
  return cache.get(key);
}

/** `crewTeam(story)` dressed for the screen and the shirt: the logo and both
 *  kits' decals become the tinted mark (primary on the dark kit, the light
 *  kit's ink on the light one). */
export async function withTintedMarks(team, crew) {
  const INKS = [inkFor('#000000'), inkFor('#ffffff')]; // the two jersey inks
  const [onDark, onLight, ...byInk] = await Promise.all([
    tintedMarkUrl(crew.mark, crew.primary),
    tintedMarkUrl(crew.mark, team.kits.light.ink),
    ...INKS.map((ink) => tintedMarkUrl(crew.mark, ink)),
  ]);
  return {
    ...team,
    logo: onDark,
    // a Locker uniform / clash-shifted kit takes the mark for ITS ink (kits.js)
    markByInk: Object.fromEntries(INKS.map((ink, i) => [ink, byInk[i]])),
    kits: { dark: { ...team.kits.dark, logoUrl: onDark }, light: { ...team.kits.light, logoUrl: onLight } },
  };
}
