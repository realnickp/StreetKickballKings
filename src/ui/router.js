// One active screen at a time inside #ui-root. Screens are factories
// returning { mount(root, params), unmount() }.
export class ScreenRouter {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.screens = new Map();
    this.current = null;
  }

  register(name, factory) {
    this.screens.set(name, factory);
  }

  async go(name, params = {}) {
    this.current?.unmount?.();
    this.root.replaceChildren();
    const screen = this.screens.get(name)(this.ctx);
    this.current = screen;
    await screen.mount(this.root, params);
    return screen;
  }
}
