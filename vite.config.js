import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Keep stable third-party code in separate browser-cacheable files. This
    // reduces the amount a returning member needs to download after an AJPA
    // portal update and makes later page-level lazy loading straightforward.
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          if (id.includes('node_modules/lucide-react/')) return 'icons';
          if (id.includes('node_modules/@vercel/analytics/')) return 'analytics';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react';
          return undefined;
        }
      }
    }
  }
})
