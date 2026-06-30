export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Handle CORS preflight
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

  // Strip /proxy from path: /proxy/api/stats -> /api/stats
  const targetPath = url.pathname.replace(/^\/proxy/, '') || '/';
  const targetUrl  = `http://93.115.101.182:9977${targetPath}${url.search}`;

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
    return new Response(JSON.stringify({ error: 'Bot API unreachable.' }), {
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
