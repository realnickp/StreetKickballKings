/** Hand the main thread back for one frame: resolves after the next animation
 *  frame plus a macrotask (so input handlers and paint get in), or after
 *  `maxWaitMs` when no frame is coming (hidden tab, node). */
export function yieldToMain(maxWaitMs = 50) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const cap = setTimeout(finish, maxWaitMs);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { clearTimeout(cap); setTimeout(finish, 0); });
    }
  });
}
