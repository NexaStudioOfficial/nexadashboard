const http  = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_HOST      = '93.115.101.182';
const BOT_PORT      = 9977;
const API_SECRET    = 'nexa_8x9KqP2vR7mZ4wL1tY6bN3sH0jF5dC8a';
const CLIENT_ID     = '1484987314533957754';
const CLIENT_SECRET = 'vHaqED2FJFIYt96O_-IIu8BpxAFuLLF9';
const REDIRECT_URI  = 'https://nexaproxy-ikfz.onrender.com/auth/callback';
const DASHBOARD_URL = 'https://nexadashboard.pages.dev';
const PORT          = process.env.PORT || 3000;

// ── Session store (in-memory) ─────────────────────────────────────────────────
const sessions = new Map();

function createSession(userData, guilds) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: userData, guilds, created: Date.now() });
  // expire after 24 hours
  setTimeout(() => sessions.delete(token), 86400000);
  return token;
}

function getSession(req) {
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim());
  const sessionCookie = cookie.find(c => c.startsWith('session='));
  if (!sessionCookie) return null;
  const token = sessionCookie.split('=')[1];
  return sessions.get(token) || null;
}

// ── CORS headers ──────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', DASHBOARD_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── Discord API helper ────────────────────────────────────────────────────────
function discordGet(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'discord.com',
      path: `/api/v10${path}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function discordPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(new URLSearchParams(body).toString());
    const opts = {
      hostname: 'discord.com',
      path: `/api/v10${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length,
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Bot API proxy ─────────────────────────────────────────────────────────────
function proxyToBot(req, res, botPath) {
  const sep = botPath.includes('?') ? '&' : '?';
  const options = {
    hostname: BOT_HOST,
    port:     BOT_PORT,
    path:     botPath + sep + `key=${API_SECRET}`,
    method:   req.method,
    headers: {
      'Authorization': `Bearer ${API_SECRET}`,
      'Content-Type':  'application/json',
    },
  };

  const proxy = http.request(options, botRes => {
    cors(res);
    res.writeHead(botRes.statusCode, { 'Content-Type': 'application/json' });
    botRes.pipe(res);
  });

  proxy.on('error', () => {
    json(res, 502, { error: 'Bot API unreachable' });
  });

  if (req.method === 'POST') {
    req.pipe(proxy);
  } else {
    proxy.end();
  }
}

// ── Read body helper ──────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
  });
}

// ── Main server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  // ── Auth: start login ──────────────────────────────────────────────────────
  if (path === '/auth/login') {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         'identify guilds',
      state,
    });
    res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params}` });
    return res.end();
  }

  // ── Auth: OAuth2 callback ──────────────────────────────────────────────────
  if (path === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(302, { Location: `${DASHBOARD_URL}?error=no_code` });
      return res.end();
    }

    try {
      // Exchange code for token
      const tokenData = await discordPost('/oauth2/token', {
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      });

      if (!tokenData.access_token) throw new Error('No access token');

      // Fetch user info and guilds
      const [user, guildsRaw] = await Promise.all([
        discordGet('/users/@me', tokenData.access_token),
        discordGet('/users/@me/guilds', tokenData.access_token),
      ]);

      // Only keep guilds where they are the owner
      const ownedGuilds = guildsRaw.filter(g => g.owner === true).map(g => ({
        id:   g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=256` : null,
      }));

      const sessionToken = createSession({ id: user.id, username: user.username, avatar: user.avatar }, ownedGuilds);

      res.writeHead(302, {
        Location:   `${DASHBOARD_URL}?login=success`,
        'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`,
      });
      return res.end();
    } catch (e) {
      console.error('[OAuth Error]', e.message);
      res.writeHead(302, { Location: `${DASHBOARD_URL}?error=auth_failed` });
      return res.end();
    }
  }

  // ── Auth: get current user ─────────────────────────────────────────────────
  if (path === '/auth/me') {
    const session = getSession(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });
    return json(res, 200, { user: session.user, guilds: session.guilds });
  }

  // ── Auth: logout ───────────────────────────────────────────────────────────
  if (path === '/auth/logout') {
    const cookie = (req.headers.cookie || '').split(';').map(c => c.trim());
    const sessionCookie = cookie.find(c => c.startsWith('session='));
    if (sessionCookie) sessions.delete(sessionCookie.split('=')[1]);
    cors(res);
    res.writeHead(200, { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // ── Bot API proxy (requires session) ──────────────────────────────────────
  if (path.startsWith('/api/')) {
    const session = getSession(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });

    // For guild-specific routes, verify the user owns that guild
    const guildId = url.searchParams.get('guild');
    if (guildId) {
      const ownsGuild = session.guilds.some(g => g.id === guildId);
      if (!ownsGuild) return json(res, 403, { error: 'You do not own that server' });
    }

    return proxyToBot(req, res, req.url);
  }

  // ── Root ───────────────────────────────────────────────────────────────────
  if (path === '/') {
    return json(res, 200, { status: 'NexaBot proxy online' });
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
