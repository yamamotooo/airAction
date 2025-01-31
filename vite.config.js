import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile";
// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: [
    '**/*.task',
  ],
  plugins: [vue(), viteSingleFile()],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
})
