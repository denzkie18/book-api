const AniList = require('../providers/AnilistProvider');
const RanobeDB = require('../providers/RanobeDBProvider');
const { findProvider } = require('./seriesBooks');
function publishedDate(book) {
  // Prefer the catalog's English release; fall back to earliest original release.
  const raw = book?.c_release_dates?.en ?? book?.c_release_date;
  const text = String(raw ?? '');
  if (!/^\d{8}$/.test(text) || text.slice(4, 6) === '00' || text.slice(6) === '00') return null;
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
function pickEnriched(book, a, r) {
  return {
    id: book.id,
    title: book.title,
    cover_url: book.coverUrl ?? null,
    publisher_name: book.publishers?.map(p => p.name).filter(Boolean).join(', ') || null,
    volume: book.volume ?? null,
    anilist_id: findProvider(book, 'anilist')?.id ?? null,
    ranobidb_id: findProvider(book, 'ranobedb')?.id ?? null,
    book_provider_id: book.bookProvider?.id ?? null,
    description: r?.description ?? r?.book_description?.description ?? null,
    genres: a?.genres ?? [],
    popularity: a?.popularity ?? null,
    // AniList averageScore is its weighted score (0–100), not meanScore.
    weighted_score: a?.averageScore ?? null,
    published_date: publishedDate(r),
    color: a?.coverImage?.color ?? null,
  };
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await fn(items[i]); }
  }));
  return results;
}
async function enrichBooks(books, summaries) {
  const warnings = [];
  if (!summaries) {
    try { summaries = await AniList.getNovelSummaries(books.map(b => findProvider(b, 'anilist')?.id).filter(Boolean)); }
    catch (e) { summaries = new Map(); warnings.push({ provider: 'anilist', message: e.message, ...(e.retryAfter && { retry_after: e.retryAfter }) }); }
  }
  const results = await mapLimit(books, 4, async book => {
    let r = null;
    if (book.bookProvider?.name?.toLowerCase() === 'ranobedb') {
      try { r = await RanobeDB.getBookById(book.bookProvider.id, 'book'); }
      catch (e) { warnings.push({ provider: 'ranobedb', book_id: book.id, message: e.message, ...(e.retryAfter && { retry_after: e.retryAfter }) }); }
    }
    const id = findProvider(book, 'anilist')?.id;
    if (id && summaries.get(id) === null) warnings.push({ provider: 'anilist', book_id: book.id, message: 'Novel not found on AniList.' });
    return pickEnriched(book, summaries.get(id), r);
  });
  return { books: results, ...(warnings.length && { warnings }) };
}
module.exports = { enrichBooks, pickEnriched, publishedDate };
