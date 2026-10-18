const { PlateAPI } = require("../dist");

function res(status, body, headers) {
  const text = body === null || body === undefined ? "<html>bad gateway</html>" : JSON.stringify(body);
  return new Response(text, { status, headers: headers || {} });
}

function ok(body, headers) {
  return res(200, body, headers);
}

function makeClient(responses, options) {
  const queue = [...responses];
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({
      url: u.origin + u.pathname,
      params: Object.fromEntries(u.searchParams.entries()),
      headers: init.headers,
      method: init.method,
    });
    if (queue.length === 0) throw new Error("unexpected request: " + url);
    const item = queue.shift();
    if (item instanceof Error) throw item;
    return item;
  };
  const client = new PlateAPI("pk_live_test", { fetch: fetchImpl, ...(options || {}) });
  const sleeps = [];
  client.sleep = async (ms) => { sleeps.push(ms); };
  return { client, calls, sleeps };
}

function level(name, items) {
  return ok({ success: true, data: [{ type: name, data: items }], total: items.length, duration_ms: 1.0 });
}

module.exports = { res, ok, makeClient, level };
