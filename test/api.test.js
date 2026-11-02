const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;
const { books } = require('../src/utils/catalog');
let upstreamCalls = 0, sawTrendingField = false;
const rankedRequests = [];
global.fetch = async (url, options = {}) => {
  if (!String(url).startsWith('https://')) return nativeFetch(url, options);
  upstreamCalls++;
  if (String(url).includes('anilist')) {
    const { variables, query } = JSON.parse(options.body);
    if (query.includes('CatalogNovels') && /\btrending\b/.test(query)) sawTrendingField = true;
    const media = id => ({ id, title: { english: `Novel ${id}` }, genres: ['Fantasy', 'Romance', 'Drama'], tags: [{ name: 'Female Protagonist' }, { name: 'Magic' }], popularity: 123, trending: id % 100, averageScore: 78, coverImage: { color: '#123456' } });
    if (query.includes('RankedCatalogNovels')) {
      rankedRequests.push({ query, ...variables });
      const ids = [...variables.ids].sort((a, b) => variables.sort === 'POPULARITY_DESC' ? b-a : a-b);
      const from = (variables.page - 1) * 50;
      return Response.json({ data: { Page: { media: ids.slice(from, from + 50).map(media), pageInfo: {hasNextPage: from + 50 < ids.length} } } });
    }
    return Response.json({ data: query.includes('CatalogNovels') ? { Page: { media: variables.ids.map(media) } } : { Media: media(variables.id) } });
  }
  const [, kind, id] = String(url).match(/\/(book|series)\/(\d+)$/);
  return Response.json({ [kind]: { id: Number(id), description: 'RanobeDB book description', c_release_dates: { en: 20260908 }, c_release_date: 20250801, books: [{ id: 1, book_type: 'main' }, { id: 1, book_type: 'main' }] } });
};
const app = require('../src/server'); let server, base;
before(async () => { await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.closeAllConnections(); server.close(); global.fetch = nativeFetch; });
async function get(path) { const response = await nativeFetch(base + '/api/v0/novel' + path); return { response, data: await response.json() }; }
const expected = ['id','title','cover_url','publisher_name','volume','anilist_id','ranobidb_id','book_provider_id','description','genres','popularity','weighted_score','published_date','color'];
test('latest has exact allowlist, provider values and stable descending IDs', async () => {
  const { response, data } = await get('/latest?perPage=3'); assert.equal(response.status, 200); assert.equal(data.total, 62);
  assert.deepEqual(Object.keys(data.books[0]), expected); assert.equal(data.books[0].description, 'RanobeDB book description'); assert.equal(data.books[0].weighted_score, 78); assert.equal(data.books[0].published_date, '2026-09-08'); assert.equal(data.books[0].color, '#123456');
  assert.deepEqual(data.books.map(b => b.id), [...data.books.map(b => b.id)].sort((a,b) => b-a));
});
test('repeated latest calls reuse cache', async () => { const n = upstreamCalls; await get('/latest?perPage=3'); assert.equal(upstreamCalls, n); });
test('bracket/comma filters are sourced from AniList, not local genres', async () => {
  const { response, data } = await get('?genres=%5Bromance,%20drama%5D&tags=female%20protagonist,magic&perPage=1');
  assert.equal(response.status, 200); assert.ok(data.total > 0); assert.equal(data.books.length, 1); assert.ok(data.books[0].genres.includes('Drama'));
});
test('all vs any filters and repeated/JSON-style names', async () => {
  assert.equal((await get('?genres=Romance,Nonexistent')).data.total, 0);
  assert.ok((await get('?genres=Romance,Nonexistent&match=any&perPage=1')).data.total > 0);
  assert.ok((await get('?genres=%5B%22Romance%22,%22Drama%22%5D&tags=Magic&tags=Female%20Protagonist&perPage=1')).data.total > 0);
  assert.equal((await get('?genres=Fantasy&tags=Missing&match=any')).data.total, 0); // AND between groups
});
test('single series deduplicates volumes without dropping distinct books', async () => {
  const { response, data } = await get('/series/1059'); assert.equal(response.status, 200); assert.equal(data.totalBooks, 11);
  assert.equal(new Set(data.books.map(b => b.book_provider_id)).size, data.totalBooks);
  assert.deepEqual(data.books.map(b => b.volume), Array.from({length:11},(_,i)=>i+1)); assert.equal(data.series.volumes, 1);
  const second = await get('/series/1010'); assert.equal(new Set(second.data.books.map(b => b.book_provider_id)).size, second.data.totalBooks);
});
test('detail routes keep rich payload and single-ID route is enriched', async () => {
  const { data } = await get('/book/1059'); assert.equal(data.book.description, 'RanobeDB book description'); assert.equal(data.totalBooks, 11);
  assert.deepEqual(Object.keys((await get('/1059')).data.book), expected);
});
test('input validation and out-of-range pages', async () => {
  for (const path of ['/latest?page=0','/latest?perPage=101','?match=none','?page=2.5','?genres=[fantasy','/abc','/0']) assert.equal((await get(path)).response.status, 400, path);
  assert.deepEqual((await get('/latest?page=99999')).data.books, []); assert.equal((await get('/9999999')).response.status, 404);
});
test('filter failure is not silently reported as zero matches', async () => {
  const provider = require('../src/providers/AnilistProvider'); const original = provider.getNovelSummaries;
  provider.getNovelSummaries = async () => { const e = new Error('AniList rate limit reached.'); e.statusCode = 429; e.retryAfter = '60'; throw e; };
  try { const { response } = await get('?genres=Fantasy'); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); }
  finally { provider.getNovelSummaries = original; }
});
test('list provider failure keeps exact fields and reports warnings', async () => {
  const provider = require('../src/providers/RanobeDBProvider'); const original = provider.getBookById;
  provider.getBookById = async () => { throw new Error('Upstream unavailable'); };
  try { const { response, data } = await get('/latest?perPage=1'); assert.equal(response.status, 200); assert.equal(data.books[0].description, null); assert.deepEqual(Object.keys(data.books[0]), expected); assert.equal(data.warnings[0].provider, 'ranobedb'); }
  finally { provider.getBookById = original; }
});
test('catalog IDs unique and both formerly conflicting volumes preserved', () => { assert.equal(new Set(books.map(b => b.id)).size, books.length); assert.equal(books.find(b => b.id === 1059).volume, 1); assert.equal(books.find(b => b.id === 1069).volume, 11); });


test('popular and trending rank only catalog volume 1 before pagination with filters', async () => {
  const provider = require('../src/providers/AnilistProvider');
  const ranobe = require('../src/providers/RanobeDBProvider');
  const { uniqueBooks, findProvider } = require('../src/utils/seriesBooks');
  const original = provider.getRankedNovelSummaries, originalBook = ranobe.getBookById;
  const eligible = uniqueBooks(books).filter(b => b.volume === 1 && findProvider(b, 'anilist'));
  assert.ok(uniqueBooks(books).some(b => b.volume !== 1), 'fixture has later volumes to exclude');
  const distinct = [...new Set(eligible.map(b => findProvider(b, 'anilist').id))].sort((a,b) => a-b);
  assert.ok(distinct.length > 2);
  const unavailable = distinct[0];
  const summaries = new Map(distinct.map((id, i) => [id, {id, genres: i % 2 ? ['Romance'] : ['Drama'], tags: [{name:'Magic'}], popularity: i, trending: distinct.length - i, averageScore: 75, coverImage: {color:'#abcdef'}}]));
  summaries.set(unavailable, null);
  summaries.get(distinct[1]).popularity = null;
  summaries.get(distinct[2]).trending = null;
  if (distinct.length > 3) { summaries.get(distinct[3]).popularity = 0; summaries.get(distinct[3]).trending = 0; }
  provider.getRankedNovelSummaries = async (ids, sort) => {
    assert.ok(ids.every(id => distinct.includes(id)));
    assert.ok(['POPULARITY_DESC', 'TRENDING_DESC'].includes(sort));
    const key = sort === 'POPULARITY_DESC' ? 'popularity' : 'trending';
    return [...summaries.values()].filter(Boolean).sort((a,b) => (b[key] ?? -1)-(a[key] ?? -1) || a.id-b.id);
  };
  ranobe.getBookById = async () => ({ description:'test' });
  try {
    const score = (b, key) => summaries.get(findProvider(b, 'anilist').id)?.[key];
    const expectedRank = key => eligible.filter(b => typeof score(b,key) === 'number').sort((a,b) => score(b,key)-score(a,key) || a.id-b.id);
    for (const [route, key] of [['popular','popularity'], ['trending','trending']]) {
      const expected = expectedRank(key);
      if (distinct.length > 3) assert.ok(expected.some(b => findProvider(b, 'anilist').id === distinct[3]), 'zero score is retained');
      for (const page of [1,2]) {
        const {response, data} = await get(`/${route}?perPage=3&page=${page}`);
        assert.equal(response.status, 200);
        assert.equal(data.total, expected.length);
        assert.deepEqual(data.books.map(b => b.id), expected.slice((page-1)*3,page*3).map(b => b.id));
        assert.ok(data.books.every(b => b.volume === 1 && books.some(local => local.id === b.id)));
        if (key === 'trending') assert.ok(data.books.every(b => b.trending === summaries.get(b.anilist_id).trending));
        else assert.deepEqual(Object.keys(data.books[0]), expectedKeys());
      }
      const filtered = await get(`/${route}?genres=Romance&tags=Magic&perPage=100`);
      assert.deepEqual(filtered.data.books.map(b => b.id), expected.filter(b => summaries.get(findProvider(b, 'anilist').id).genres.includes('Romance')).map(b => b.id));
    }
    assert.notDeepEqual(expectedRank('popularity').map(b => b.id), expectedRank('trending').map(b => b.id));
    const allPopular = await get('/popular?perPage=100');
    assert.ok(allPopular.data.books.every(b => b.volume === 1));
    const allTrending = await get('/trending?perPage=100');
    assert.ok(allTrending.data.books.every(b => b.volume === 1));
  } finally { provider.getRankedNovelSummaries = original; ranobe.getBookById = originalBook; }
});
function expectedKeys() { return expected; }

test('ranked routes fail closed on AniList outage or rate limit', async () => {
  const provider = require('../src/providers/AnilistProvider'), original = provider.getRankedNovelSummaries;
  provider.getRankedNovelSummaries = async () => { const e = new Error('AniList rate limit reached.'); e.statusCode=429; e.retryAfter='30'; throw e; };
  try { for (const path of ['/popular','/trending']) { const {response} = await get(path); assert.equal(response.status,429); assert.equal(response.headers.get('retry-after'),'30'); } }
  finally { provider.getRankedNovelSummaries=original; }
});

test('AniList batch query includes trending', () => assert.equal(sawTrendingField, true));


test('ranked routes request AniList native sort and preserve its returned order', async () => {
  const { uniqueBooks, findProvider } = require('../src/utils/seriesBooks');
  const candidates = uniqueBooks(books).filter(b => b.volume === 1 && findProvider(b,'anilist'));
  for (const [route, sort] of [['popular','POPULARITY_DESC'], ['trending','TRENDING_DESC']]) {
    const count = rankedRequests.length;
    const {response, data} = await get(`/${route}?perPage=100`);
    assert.equal(response.status, 200);
    const req = rankedRequests[count];
    assert.equal(req.sort, sort);
    assert.match(req.query, /sort:\[\$sort\]/);
    assert.match(req.query, /id_in:\$ids/);
    const order = (a,b) => (sort === 'POPULARITY_DESC' ? b-a : a-b);
    const expected = candidates.slice().sort((a,b) => order(findProvider(a,'anilist').id,findProvider(b,'anilist').id) || a.id-b.id);
    assert.deepEqual(data.books.map(b => b.id), expected.map(b => b.id));
    const n = rankedRequests.length;
    await get(`/${route}?perPage=1`);
    assert.equal(rankedRequests.length, n, 'ranked response should be cached');
  }
});

test('native ranking paginates one whole AniList ID set', async () => {
  const provider = require('../src/providers/AnilistProvider');
  const ids = Array.from({length: 63}, (_,i) => 2000000+i);
  const n = rankedRequests.length;
  const ranked = await provider.getRankedNovelSummaries(ids, 'POPULARITY_DESC');
  assert.deepEqual(ranked.map(x => x.id), ids.slice().reverse());
  assert.equal(rankedRequests.length-n, 2);
  assert.deepEqual(rankedRequests.slice(n).map(x => x.page), [1,2]);
  assert.ok(rankedRequests.slice(n).every(x => x.ids.length === 63 && x.sort === 'POPULARITY_DESC'));
});
