const express = require('express');
const { books } = require('../utils/catalog');
const loadBook = require('../middleware/loadBook');
const { parseGenres, matches, bad } = require('../utils/genres');
const { onePerSeries, uniqueBooks, findProvider } = require('../utils/seriesBooks');
const { enrichBooks } = require('../utils/enrichBooks');
const AniList = require('../providers/AnilistProvider');
const httpError = require('../utils/httpError');
const router = express.Router();
function pagination(query) {
  const page = query.page ?? '1', perPage = query.perPage ?? '10';
  if ([page, perPage].some(x => typeof x !== 'string' || !/^[1-9]\d*$/.test(x))) bad('page and perPage must be positive integers.');
  if (!Number.isSafeInteger(Number(page)) || !Number.isSafeInteger(Number(perPage)) || Number(perPage) > 100) bad('page must be a safe positive integer and perPage must be between 1 and 100.');
  return { page: Number(page), perPage: Number(perPage) };
}
async function list(req, res, latest = false) {
  try {
    const { page, perPage } = pagination(req.query);
    if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 200)) bad('q must be a string at most 200 characters long.');
    const mode = req.query.match ?? 'all';
    if (!['all', 'any'].includes(mode)) bad('match must be "all" or "any".');
    const genres = parseGenres(req.query.genres), tags = parseGenres(req.query.tags, 'tags');
    const search = (req.query.q ?? '').trim().toLowerCase();
    let results = uniqueBooks(books).filter(b => b.title.toLowerCase().includes(search));
    let summaries;
    if (genres.length || tags.length) {
      // Fetch only AniList metadata for candidate series. Do not request every
      // RanobeDB book just to evaluate a filter. Fail closed if AniList fails.
      summaries = await AniList.getNovelSummaries(results.map(b => findProvider(b, 'anilist')?.id).filter(Boolean));
      results = results.filter(b => {
        const a = summaries.get(findProvider(b, 'anilist')?.id);
        return a && matches(a.genres ?? [], genres, mode) && matches((a.tags ?? []).map(t => t.name), tags, mode);
      });
    }
    if (!latest && (search || genres.length || tags.length)) results = onePerSeries(results);
    if (latest) results.sort((a, b) => b.id - a.id);
    const total = results.length, totalPages = Math.ceil(total / perPage);
    const slice = page > totalPages ? [] : results.slice((page - 1) * perPage, page * perPage);
    const data = await enrichBooks(slice, summaries);
    return res.json({ page, perPage, total, totalPages, hasNextPage: page < totalPages, ...data });
  } catch (error) { return httpError(res, error); }
}
router.get('/', (req, res) => list(req, res));
router.get('/latest', (req, res) => list(req, res, true));
router.param('id', loadBook);
router.get('/:id', async (req, res) => {
  try {
    const data = await enrichBooks([req.book]);
    return res.json(data.warnings ? { book: data.books[0], warnings: data.warnings } : { book: data.books[0] });
  } catch (error) { return httpError(res, error); }
});
module.exports = router;
