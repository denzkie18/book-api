const { books } = require('./catalog');
function findProvider(book, name) {
  return book.providers?.find(p => p.name?.toLowerCase() === name.toLowerCase());
}
function seriesKey(book) {
  const p = findProvider(book, 'ranobedb') ?? findProvider(book, 'anilist');
  return p ? `${p.name.toLowerCase()}:${p.id}` : `book:${book.id}`;
}
function identity(book) {
  return book.bookProvider?.id ? `${book.bookProvider.name.toLowerCase()}:${book.bookProvider.id}` : `local:${book.id}`;
}
function uniqueBooks(list) {
  return [...new Map(list.map(b => [identity(b), b])).values()];
}
function pickBookFields(book) {
  return { id: book.id, title: book.title, volume: book.volume ?? null, cover_url: book.coverUrl ?? null, book_provider_id: book.bookProvider?.id ?? null };
}
function booksInSeries(book) {
  const key = seriesKey(book);
  return uniqueBooks(books.filter(b => seriesKey(b) === key)).sort((a, b) => (a.volume ?? Infinity) - (b.volume ?? Infinity) || a.id - b.id);
}
function onePerSeries(list) {
  const best = new Map();
  for (const b of uniqueBooks(list)) {
    const key = seriesKey(b), prev = best.get(key);
    if (!prev || (b.volume ?? Infinity) < (prev.volume ?? Infinity) || (b.volume === prev.volume && b.id < prev.id)) best.set(key, b);
  }
  return [...best.values()];
}
module.exports = { findProvider, pickBookFields, booksInSeries, onePerSeries, uniqueBooks, seriesKey };
