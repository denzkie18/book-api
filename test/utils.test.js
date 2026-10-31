const { test } = require('node:test'); const assert = require('node:assert/strict');
const { parseGenres, matches } = require('../src/utils/genres');
const { publishedDate } = require('../src/utils/enrichBooks');
const { createClient } = require('../src/utils/providerClient');
test('parse genre/tag forms and reject malformed names', () => {
  assert.deepEqual(parseGenres('[Romance, Drama,romance]'), ['romance','drama']); assert.deepEqual(parseGenres(['Fantasy','Romance,Drama']), ['fantasy','romance','drama']);
  assert.throws(() => parseGenres({ x: 1 })); assert.throws(() => parseGenres('[romance')); assert.throws(() => parseGenres('a'.repeat(101)));
  assert.equal(matches(['Romance'], [], 'any'), true);
});
test('release date precedence and partial/invalid dates', () => {
  assert.equal(publishedDate({c_release_dates:{en:20260102},c_release_date:20200101}), '2026-01-02');
  assert.equal(publishedDate({c_release_date:20200101}), '2020-01-01'); assert.equal(publishedDate({c_release_date:20260230}), null); assert.equal(publishedDate({c_release_date:20260000}), null);
});
test('in-flight dedup, bounded cache and expiry', async () => {
  const c = createClient({ name:'Test',url:'https://example.test', interval:0,ttl:20,maxEntries:2 }); let n=0;
  const load = async () => { n++; await new Promise(r => setTimeout(r,5)); return 1; };
  assert.deepEqual(await Promise.all([c.cached('x',load),c.cached('x',load)]),[1,1]); assert.equal(n,1);
  await c.cached('x',load); assert.equal(n,1); await new Promise(r=>setTimeout(r,25)); await c.cached('x',load); assert.equal(n,2);
  c.put('a',1);c.put('b',2); assert.equal(c.peek('x'), undefined);
});
test('429 honors Retry-After, pauses upstream without retry storm', async () => {
  const old=global.fetch; let n=0; global.fetch=async()=>{ n++; return new Response('{}',{status:429,headers:{'retry-after':'2'}}); };
  try { const c=createClient({name:'Test',url:'https://example.test',interval:0}); await assert.rejects(c.request(),e=>e.statusCode===429&&e.retryAfter==='2'); await assert.rejects(c.request(),e=>e.statusCode===429); assert.equal(n,1); }
  finally {global.fetch=old;}
});
test('provider pacing is shared and unsuccessful loads are not cached', async () => {
  const old=global.fetch,times=[];global.fetch=async()=>{times.push(Date.now());return Response.json({ok:true});};
  try { const c=createClient({name:'Test',url:'https://example.test',interval:35}); await Promise.all([c.request(),c.request(),c.request()]); assert.ok(times[1]-times[0]>=25); assert.ok(times[2]-times[1]>=25); let calls=0; const loader=async()=>{calls++;throw new Error('failure');}; await assert.rejects(c.cached('fail',loader));await assert.rejects(c.cached('fail',loader));assert.equal(calls,2); }
  finally{global.fetch=old;}
});
