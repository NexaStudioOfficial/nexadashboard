export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Strip /proxy prefix to get the real path e.g. /proxy/api/stats -> /api/stats
  const targetPath = url.pathname.replace(/^\/proxy/, '') + url.search;
  const targetUrl  = `http://93.115.101.182:9977${targetPath}`;

  const init = {
    method:  context.request.method,
    headers: {
      'Authorization': context.request.headers.get('Authorization') || '',
      'Content-Type':  'application/json',
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const body    = await response.text();
  const headers = new Headers({
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });

  return new Response(body, { status: response.status, headers });
}
