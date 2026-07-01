const http  = require('http');
const https = require('https');

const BOT_HOST   = '93.115.101.182';
const BOT_PORT   = 9977;
const API_SECRET = 'nexa_8x9KqP2vR7mZ4wL1tY6bN3sH0jF5dC8a';
const PORT       = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Forward request to bot
  const options = {
    hostname: BOT_HOST,
    port:     BOT_PORT,
    path:     req.url + (req.url.includes('?') ? '&' : '?') + `key=${API_SECRET}`,
    method:   req.method,
    headers: {
      'Authorization': `Bearer ${API_SECRET}`,
      'Content-Type':  'application/json',
    },
  };

  const proxy = http.request(options, (botRes) => {
    res.writeHead(botRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    botRes.pipe(res);
  });

  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bot API unreachable' }));
  });

  if (req.method === 'POST') {
    req.pipe(proxy);
  } else {
    proxy.end();
  }
});

server.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
