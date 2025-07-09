import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'x-swid', 'x-espn-s2'],
  exposedHeaders: ['Content-Type'],
}));
app.use(express.json());

// Proxy ESPN requests, injecting cookies and stripping custom headers
const espnProxy = createProxyMiddleware({
  target: 'https://fantasy.espn.com',
  changeOrigin: true,
  pathRewrite: { '^/espn': '' },
  onProxyReq: (proxyReq, req) => {
    const swid = req.headers['x-swid'];
    const espnS2 = req.headers['x-espn-s2'];

    if (!swid || !espnS2) {
      // Short-circuit the request if cookies are missing
      throw new Error('Missing SWID or espn_s2');
    }

    // Inject auth cookies
    proxyReq.setHeader('Cookie', `SWID=${swid}; espn_s2=${espnS2}`);

    // Remove our custom headers so ESPN doesn’t see them
    proxyReq.removeHeader('x-swid');
    proxyReq.removeHeader('x-espn-s2');
  },
});

app.use('/espn', espnProxy);

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
}); 