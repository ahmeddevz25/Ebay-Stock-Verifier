import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/ebay/verify-batch') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { itemIds } = parsed;
              const results = {};
              for (const id of (itemIds || [])) {
                const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const mod = hash % 100;
                if (mod < 62) {
                  results[id] = { status: 'AVAILABLE', quantity: (hash % 45) + 1, title: `Product Listing #${id}`, price: `USD ${((hash % 150) + 9.99).toFixed(2)}`, found: true };
                } else if (mod < 82) {
                  results[id] = { status: 'OUT_OF_STOCK', quantity: 0, title: `Out of Stock Item #${id}`, price: `USD ${((hash % 100) + 14.50).toFixed(2)}`, found: true };
                } else if (mod < 96) {
                  results[id] = { status: 'ENDED / SOLD OUT', quantity: 0, title: `Completed Listing #${id}`, price: `USD ${((hash % 200) + 25.00).toFixed(2)}`, found: true };
                } else {
                  results[id] = { status: 'INVALID / REMOVED', quantity: 0, title: `Listing Deleted or Inaccessible`, price: '', found: false };
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, results, mode: 'demo' }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (req.url === '/api/ebay/auth' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, token: 'dev_mock_token_12345' }));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: {
    port: 3000
  }
});
