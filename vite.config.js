import { defineConfig } from 'vite';
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  build: {
    // Use index.html as entry (default), and generate a static site in dist/
    target: 'es2019',
    minify: 'terser',        // strong minification
    sourcemap: false         // do NOT ship source maps if you care about obfuscation
  },
  plugins: [
    obfuscatorPlugin({
      // These options go directly to javascript-obfuscator
      // Keep them moderate so performance doesn't tank
      options: {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        stringArray: true,
        stringArrayThreshold: 0.75,
        renameGlobals: false
      }
    })
  ]
});
