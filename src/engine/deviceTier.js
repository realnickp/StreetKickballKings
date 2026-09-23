// ONE decision at boot about how much phone there is. The audit (2026-09-12)
// measured the render pipeline at ~100 MB of render targets, a 2048² soft
// shadow map, two H.264 decoders and sixteen shadow casters on EVERY device,
// and iOS jetsams web content somewhere between 600 MB and ~1 GB on a 4 GB
// phone. The PerfWatchdog only ever stepped MSAA down after 8 s and touched
// nothing else. This table is read by the renderer (dpr, msaa, bloom, grade),
// the field (shadow map, backdrop video mode) and the match scene (how many
// rigs cast shadows). ?tier=low|mid|high overrides it for testing.
export const TIERS = {
  low:  { name: 'low',  dpr: 1.5, msaa: 0, bloom: false, grade: false, shadowMap: 1024, video: 'none',  casters: 6 },
  mid:  { name: 'mid',  dpr: 2,   msaa: 2, bloom: true,  grade: true,  shadowMap: 1024, video: 'front', casters: 8 },
  high: { name: 'high', dpr: 2,   msaa: 4, bloom: true,  grade: true,  shadowMap: 2048, video: 'both',  casters: 16 },
};

/** Pure: decide from what the browser tells us. iOS never lands on `high`
 *  (the memory ceiling is the whole problem); Android trusts `deviceMemory`
 *  (Chrome rounds to a power of two, so 6 GB reads 4) and the core count;
 *  anything that is not a phone is high. Missing signals fall to the middle.
 *
 *  iOS exposes no memory signal, so the audit's kill zone (SE / 8 body, the
 *  phone that reloads first) is read off the SCREEN: 375 pt at 2× is that
 *  body and nothing else. The 375 pt @3× phones (X/XS/11 Pro/12-13 mini) are
 *  3-4 GB like the XR/11 and stay mid; iOS 15 devices are old hardware. */
export function detectTier(env = {}) {
  const { ua = '', platform = '', maxTouchPoints = 0, deviceMemory = null, hardwareConcurrency = null, screenW = 0, screenH = 0, dpr = 2, override = null } = env;
  if (override && TIERS[override]) return { ...TIERS[override], reason: 'override' };
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (isIOS) {
    const m = ua.match(/OS (\d+)_/);
    const major = m ? Number(m[1]) : null;
    const shortSide = Math.min(screenW || Infinity, screenH || Infinity);
    if (major !== null && major < 16) return { ...TIERS.low, reason: 'ios-old' };
    if (Number.isFinite(shortSide) && shortSide <= 380 && dpr <= 2) return { ...TIERS.low, reason: 'ios-small' };
    return { ...TIERS.mid, reason: 'ios' };
  }
  if (isAndroid) {
    if ((deviceMemory !== null && deviceMemory <= 2) || (hardwareConcurrency !== null && hardwareConcurrency <= 4)) return { ...TIERS.low, reason: 'android-low' };
    if (deviceMemory !== null && deviceMemory >= 8) return { ...TIERS.high, reason: 'android-high' };
    return { ...TIERS.mid, reason: 'android' };
  }
  return { ...TIERS.high, reason: 'desktop' };
}

/** Read the live browser. Safe without a window (tests, SSR-less builds). */
export function tierFromBrowser(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return { ...TIERS.high, reason: 'no-window' };
  const nav = win.navigator ?? {};
  let override = null;
  try { override = new URLSearchParams(win.location?.search ?? '').get('tier'); } catch { /* fine */ }
  return detectTier({
    ua: nav.userAgent ?? '', platform: nav.platform ?? '', maxTouchPoints: nav.maxTouchPoints ?? 0,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    screenW: win.screen?.width ?? 0, screenH: win.screen?.height ?? 0, dpr: win.devicePixelRatio ?? 2, override,
  });
}
