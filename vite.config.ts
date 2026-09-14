import { defineConfig } from 'vite'

export default defineConfig({
  envPrefix: ['VITE_', 'OTA_'],
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})

