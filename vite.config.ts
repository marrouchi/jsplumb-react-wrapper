import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    target: 'es2019',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'JsPlumbReactWrapper',
      fileName: (format) => (format === 'es' ? 'index.es.js' : 'index.cjs.js')
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  },
  server: {
    port: 5173
  }
}));
