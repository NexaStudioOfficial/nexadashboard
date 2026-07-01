const API_SECRET = 'nexa_8x9KqP2vR7mZ4wL1tY6bN3sH0jF5dC8a';
const BOT_BASE   = 'http://93.115.101.182:9977';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  // Strip /proxy prefix: /proxy/api/stats -> /api/stats
  const targetPath = url.pathname.replace(/^\/proxy/, '') || '/';

  // Forward query params and append the key as fallback auth
  const targetParams = new URLSearchParams(url.search);
  targetParams.set('key', API_SECRET);
  const targetUrl = `${BOT_BASE}${targetPath}?${targetParams.toString()}`;

  const init = {
    method: context.request.method,
    headers: {
      'Authorization': `Bearer ${API_SECRET}`,
      'Content-Type': 'application/json',
    },
  };

  if (context.request.method === 'POST') {
    init.body = await context.request.text();
  }

  let response;
  try {
    response = await fetch(targetUrl, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bot API unreachable. Make sure the bot is running on WispByte.' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
