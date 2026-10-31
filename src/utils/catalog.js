// Validate at boot: never silently drop a distinct volume with a reused local ID.
const { books } = require('../data/novels.json');
const ids = new Set();
for (const book of books) {
  if (!Number.isSafeInteger(book.id) || book.id <= 0 || ids.has(book.id)) throw new Error(`Invalid or duplicate local book ID: ${book.id}. Run the catalog migration first.`);
  ids.add(book.id);
}
module.exports = { books };
