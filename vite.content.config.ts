import { defineConfig } from 'vite';
export default defineConfig({ define: { 'import.meta.env.VITE_JEV_MOCK': JSON.stringify(process.env.VITE_JEV_MOCK === '1' ? '1' : '0') }, publicDir: false, build: { outDir: process.env.VITE_JEV_MOCK === '1' ? 'dist-mock' : 'dist', target: 'chrome120', emptyOutDir: false, rolldownOptions: { output: { minify: { compress: { dropConsole: true } } } },
  lib: { entry: 'src/content/index.ts', name: 'JevFocusContent', formats: ['iife'], fileName: () => 'content.js' },
} });
