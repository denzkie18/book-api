const app = require('../src/server');
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let failed = false;
  try {
    for (const path of ['/api/v0/novel/latest?perPage=2', '/api/v0/novel?genres=[fantasy,adventure]&tags=female%20protagonist&perPage=1', '/api/v0/novel/series/1059']) {
      const start = Date.now(); const r = await fetch(base + path); const data = await r.json();
      console.log(JSON.stringify({ path, status: r.status, ms: Date.now() - start, total: data.total ?? data.totalBooks, fields: Object.keys(data.books?.[0] ?? {}), warnings: data.warnings ?? data.errors ?? null }));
      if (!r.ok || data.warnings || data.errors) failed = true;
    }
  } catch (e) { console.error(e); failed = true; }
  finally { server.closeAllConnections(); server.close(); process.exitCode = failed ? 1 : 0; }
});
