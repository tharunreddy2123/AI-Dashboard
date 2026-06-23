import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get OpenShift credentials from environment variables
  const OPENSHIFT_API_URL = env.VITE_OPENSHIFT_API_URL || 'https://api.rm3.7wse.p1.openshiftapps.com:6443';
  const OPENSHIFT_TOKEN = env.VITE_OPENSHIFT_TOKEN || '';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: {
        '/api/openshift': {
          target: OPENSHIFT_API_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/openshift/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${OPENSHIFT_TOKEN}`);
              proxyReq.setHeader('Accept', 'application/json');
            });
          },
        },
      },
    },
  };
});
