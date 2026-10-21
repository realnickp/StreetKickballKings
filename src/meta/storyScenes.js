// Every story scene, from every script file under data/story/scenes/ — one map
// of id → scene. A glob, so a region's script goes live the moment its file
// lands (the writers work region by region).
const files = import.meta.glob('../data/story/scenes/*.json', { eager: true, import: 'default' });

export const SCENES = Object.assign({}, ...Object.values(files).map((f) => f?.scenes ?? {}));
