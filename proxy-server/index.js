import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware to proxy ESPN requests using cookies from headers
app.use('/espn', (req, res, next) => {
  const swid = req.headers['x-swid'];
  const espnS2 = req.headers['x-espn-s2'];

  if (!swid || !espnS2) {
    return res.status(400).json({ error: 'Missing SWID or ESPN_S2' });
  }

  createProxyMiddleware({
    target: 'https://fantasy.espn.com',
    changeOrigin: true,
    pathRewrite: { '^/espn': '' },
    headers: {
      Cookie: `SWID=${swid}; ESPN_S2=${espnS2}`,
    },
  })(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
}); 