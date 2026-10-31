function bad(message) { const e = new Error(message); e.statusCode = 400; throw e; }
// Accept romance; romance,drama; [romance, drama]; ["Romance","Drama"];
// and repeated query parameters (?genres=romance&genres=drama).
function parseGenres(value, label = 'genres') {
  if (value === undefined || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.some(v => typeof v !== 'string')) bad(`${label} must be a string or repeated string parameter.`);
  const result = [];
  for (let text of values) {
    text = text.trim();
    if (text.startsWith('[') !== text.endsWith(']')) bad(`${label} has mismatched brackets.`);
    if (text.startsWith('[')) text = text.slice(1, -1);
    for (let item of text.split(',')) {
      item = item.trim().replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase();
      if (item) result.push(item);
    }
  }
  const unique = [...new Set(result)];
  if (unique.length > 20 || unique.some(v => v.length > 100 || /[\[\]{}]/.test(v))) bad(`${label} must contain at most 20 names, each at most 100 characters.`);
  return unique;
}
function matches(have, wanted, mode = 'all') {
  if (!wanted.length) return true;
  const set = new Set(have.map(v => v.toLowerCase()));
  return mode === 'any' ? wanted.some(v => set.has(v)) : wanted.every(v => set.has(v));
}
function filterByGenres(list, wanted, mode = 'all') { return list.filter(b => matches(b.genres ?? [], wanted, mode)); }
module.exports = { parseGenres, matches, filterByGenres, bad };
