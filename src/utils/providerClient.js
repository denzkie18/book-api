// One queue per upstream, shared by detail and summary calls in this process.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class ProviderError extends Error {
  constructor(message, statusCode = 502, retryAfter = null) {
    super(message); this.statusCode = statusCode; this.retryAfter = retryAfter;
  }
}
function retrySeconds(value, fallback = 60) {
  if (!value) return fallback;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : Math.max(1, Math.ceil((Date.parse(value) - Date.now()) / 1000) || fallback);
}
function createClient({ name, url, interval = 2200, ttl = 3600000, maxEntries = 2000 }) {
  const cache = new Map(), pending = new Map();
  let tail = Promise.resolve(), nextAt = 0, blockedUntil = 0;
  function limited(operation) {
    const run = tail.then(async () => {
      if (Date.now() < blockedUntil) throw new ProviderError(`${name} is cooling down after a rate limit.`, 429, String(Math.ceil((blockedUntil - Date.now()) / 1000)));
      await sleep(Math.max(0, nextAt - Date.now()));
      nextAt = Date.now() + interval;
      return operation();
    });
    tail = run.catch(() => {});
    return run;
  }
  async function request(path = '', body) {
    return limited(async () => {
      let response;
      try {
        response = await fetch(url + path, {
          method: body ? 'POST' : 'GET',
          headers: { Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
          ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
        throw new ProviderError(timeout ? `${name} request timed out.` : `Unable to connect to ${name}.`, timeout ? 504 : 502);
      }
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      if (response.headers.get('x-ratelimit-remaining') === '0' && reset > Date.now()) nextAt = Math.max(nextAt, reset + 1000);
      if (response.status === 429) {
        const seconds = retrySeconds(response.headers.get('retry-after'));
        blockedUntil = Date.now() + seconds * 1000;
        throw new ProviderError(`${name} rate limit reached.`, 429, String(seconds));
      }
      if (!response.ok) throw new ProviderError(`${name} returned HTTP ${response.status}.`, response.status === 404 ? 404 : 502);
      let data;
      try { data = await response.json(); } catch { throw new ProviderError(`${name} returned invalid JSON.`); }
      if (data.errors?.length) {
        const status = data.errors.some(e => Number(e.status) === 429) ? 429 : data.errors.some(e => Number(e.status) === 404) ? 404 : 502;
        if (status === 429) blockedUntil = Date.now() + 60000;
        throw new ProviderError(`${name} could not complete the query.`, status, status === 429 ? '60' : null);
      }
      return data;
    });
  }
  function cached(key, loader) {
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return Promise.resolve(entry.value);
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(loader).then(value => { put(key, value); return value; }).finally(() => pending.delete(key));
    pending.set(key, promise); return promise;
  }
  function put(key, value) {
    cache.delete(key); cache.set(key, { value, expires: Date.now() + ttl });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }
  function peek(key) { const e = cache.get(key); return e && e.expires > Date.now() ? e.value : undefined; }
  return { request, cached, put, peek };
}
module.exports = { createClient, ProviderError };
