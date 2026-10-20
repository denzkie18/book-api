const { books } = require("../data/novels.json");

const BOOK_FIELDS = ["id", "title", "volume", "coverUrl"];

function findProvider(book, name) {
  return book.providers?.find((item) => item.name?.toLowerCase() === name);
}

function pickBookFields(book) {
  return Object.fromEntries(BOOK_FIELDS.map((key) => [key, book[key] ?? null]));
}

// Local books that share the same RanobeDB series ID (AniList ID as fallback).
function booksInSeries(book) {
  const provider =
    findProvider(book, "ranobedb") ?? findProvider(book, "anilist");

  if (!provider) return [book];

  const name = provider.name.toLowerCase();

  return books
    .filter((item) => findProvider(item, name)?.id === provider.id)
    .sort((x, y) => x.id - y.id);
}

// One book per series: lowest volume wins, then lowest local id.
// Series are keyed by RanobeDB series ID, or AniList ID if there is none.
function onePerSeries(list) {
  const best = new Map();

  for (const book of list) {
    const provider =
      findProvider(book, "ranobedb") ?? findProvider(book, "anilist");
    const key = provider
      ? `${provider.name.toLowerCase()}:${provider.id}`
      : `book:${book.id}`;

    const current = best.get(key);
    const rank = (b) => [b.volume ?? Infinity, b.id];
    const [v1, i1] = rank(book);
    const [v2, i2] = current ? rank(current) : [Infinity, Infinity];

    if (!current || v1 < v2 || (v1 === v2 && i1 < i2)) {
      best.set(key, book);
    }
  }

  return [...best.values()];
}

module.exports = { findProvider, pickBookFields, booksInSeries, onePerSeries };