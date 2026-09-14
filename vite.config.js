import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Vite's default target is safari16.4 / ios16.4: the bundle shipped class
    // static blocks and private fields, and an iPhone 7, an iPad Air 2, or any
    // un-updated 16.0-16.3 device threw a SyntaxError while parsing the module
    // and showed an empty stage with no message (Phase 0, 2026-09-12). iOS 15
    // is where WebGL2 (which three r184 needs) begins, so that is the floor.
    // Chrome 87+ / Android WebView are comfortably above all of this.
    target: ['es2020', 'safari15', 'chrome87', 'firefox78'],
  },
});
