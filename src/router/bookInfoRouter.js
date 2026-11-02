const express = require("express");
const AnilistProvider = require("../providers/AnilistProvider");
const RanobeDBProvider = require("../providers/RanobeDBProvider");
const loadBook = require("../middleware/loadBook");

const {
  findProvider,
  pickBookFields,
  booksInSeries,
} = require("../utils/seriesBooks");

const router = express.Router();

router.param("id", loadBook);

// GET /api/v0/novel/book/:id
// All AniList data, with these replaced or added:
//   bookCloudId, publishers, coverUrl, volume  <- novels.json
//   description                                <- RanobeDB (bookProvider ID)
router.get("/:id", async (req, res) => {
  const { bookCloudId, publishers, coverUrl, volume, bookProvider } = req.book;

  const anilistProvider = findProvider(req.book, "anilist");
  const hasRanobedb = bookProvider?.name?.toLowerCase() === "ranobedb";

  const [a, r] = await Promise.allSettled([
    anilistProvider ? AnilistProvider.getNovelById(anilistProvider.id) : null,
    hasRanobedb ? RanobeDBProvider.getBookById(bookProvider.id, "book") : null,
  ]);

  const errors = {};
  for (const [name, result] of [["anilist", a], ["ranobedb", r]]) {
    if (result.status !== "rejected") continue;

    console.error(`${name} request failed:`, result.reason.message);

    if (result.reason.retryAfter) {
      res.set("Retry-After", result.reason.retryAfter);
    }

    errors[name] = result.reason.statusCode
      ? result.reason.message
      : "An unexpected error occurred.";
  }

  const aData = a.status === "fulfilled" ? a.value : null;
  const rData = r.status === "fulfilled" ? r.value : null;

  const ranobedbDescription =
    rData?.description ?? rData?.book_description?.description ?? null;

  const seriesBooks = booksInSeries(req.book);

  return res.json({
    bookId: req.book.id,
    book: {
      ...(aData ?? {}),
      bookCloudId,
      publishers,
      coverUrl,
      bookTitle: title,
      volume,
      // Keep AniList's description if RanobeDB has none.
      description: ranobedbDescription ?? aData?.description ?? null,
    },
    totalBooks: seriesBooks.length,
    books: seriesBooks.map(pickBookFields),
    ...(Object.keys(errors).length && { errors }),
  });
});

module.exports = router;