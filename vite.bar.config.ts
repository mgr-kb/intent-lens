import { defineConfig } from 'vite';
// Independent graph: no options/background chunks are exposed through WAR.
export default defineConfig({
 define: { 'import.meta.env.VITE_JEV_MOCK': JSON.stringify(process.env.VITE_JEV_MOCK === '1' ? '1' : '0') },
 publicDir: false, base: './', build: {
  outDir: process.env.VITE_JEV_MOCK === '1' ? 'dist-mock' : 'dist', emptyOutDir: false, target: 'chrome120',
  rolldownOptions: { input: { bar: 'bar.html' }, output: {
   minify: { compress: { dropConsole: true } }, entryFileNames: 'bar-assets/[name].js',
   chunkFileNames: 'bar-assets/[name]-[hash].js', assetFileNames: 'bar-assets/[name]-[hash][extname]',
  } },
 },
});
