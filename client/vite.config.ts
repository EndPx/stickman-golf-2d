import { defineConfig } from 'vite';

// R17.2 - Vite is the only development server and the only bundler.
//
// The Vite root is this directory, passed on the command line as `vite client`; Vite then discovers
// this file automatically. Root is deliberately not set here, because resolving this file's own
// directory in ESM needs either `node:url` or `import.meta.dirname`, and `@types/node` is outside
// the dependency set R17.6 gates.
//
// `shared/` sits one level above the root. `fs.allow` opens that parent so the client can import the
// shared modules by relative path with no bundler alias standing between them, which is what keeps
// those modules loadable under plain Node as well (R17.9).
export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
