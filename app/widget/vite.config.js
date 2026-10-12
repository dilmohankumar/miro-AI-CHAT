import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bundles React + Tailwind into ONE self-contained IIFE: public/widget.js
// (served by the backend and embedded on any website with a <script> tag).
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    lib: { entry: 'src/main.jsx', name: 'WebsiteChatbot', formats: ['iife'], fileName: () => 'widget.js' },
    outDir: '../public',
    emptyOutDir: false, // public/ also holds demo.html
    cssCodeSplit: false,
  },
});
