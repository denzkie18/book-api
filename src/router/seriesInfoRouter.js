const express = require("express");
const AnilistProvider = require("../providers/AnilistProvider");
const RanobeDBProvider = require("../providers/RanobeDBProvider");
const loadBook = require("../middleware/loadBook");

const router = express.Router();

router.param("id", loadBook);

function handleError(res, error) {
  console.error("Series request failed:", error.message);

  if (error.retryAfter) {
    res.set("Retry-After", error.retryAfter);
  }

  return res.status(error.statusCode || 500).json({
    message: error.statusCode
      ? error.message
      : "An unexpected error occurred.",
  });
}

function findProvider(book, name) {
  return book.providers?.find((item) => item.name?.toLowerCase() === name);
}

// The only RanobeDB fields merged into the AniList data.
function ranobedbFields(s) {
  return {
    status: s.publication_status ?? null,
    volumes: (s.books ?? []).filter((b) => b.book_type === "main").length,
    publishers: s.publishers ?? [],
    website: s.website ?? null,
    webNovel: s.web_novel ?? null,
  };
}

// GET /api/v0/novel/series/:id/anilist  (original AniList data)
router.get("/:id/anilist", async (req, res) => {
  const provider = findProvider(req.book, "anilist");

  if (!provider) {
    return res.status(404).json({
      message: "This book does not have an AniList provider.",
    });
  }

  try {
    const series = await AnilistProvider.getNovelById(provider.id);
    return res.json({ bookId: req.book.id, provider: provider.name, series });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/v0/novel/series/:id/ranobedb  (original RanobeDB data)
router.get("/:id/ranobedb", async (req, res) => {
  const provider = findProvider(req.book, "ranobedb");

  if (!provider) {
    return res.status(404).json({
      message: "This book does not have a RanobeDB provider.",
    });
  }

  try {
    const series = await RanobeDBProvider.getBookById(provider.id, "series");
    return res.json({ bookId: req.book.id, provider: provider.name, series });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/v0/novel/series/:id
// AniList data as-is, with status, volumes, publishers, website and
// webNovel taken from RanobeDB.
router.get("/:id", async (req, res) => {
  const anilist = findProvider(req.book, "anilist");
  const ranobedb = findProvider(req.book, "ranobedb");

  if (!anilist && !ranobedb) {
    return res.status(404).json({
      message: "This book does not have an AniList or RanobeDB provider.",
    });
  }

  const [a, r] = await Promise.allSettled([
    anilist ? AnilistProvider.getNovelById(anilist.id) : null,
    ranobedb ? RanobeDBProvider.getBookById(ranobedb.id, "series") : null,
  ]);

  const errors = {};
  if (a.status === "rejected") errors.anilist = a.reason.message;
  if (r.status === "rejected") errors.ranobedb = r.reason.message;

  const aData = a.status === "fulfilled" ? a.value : null;
  const rData = r.status === "fulfilled" ? r.value : null;

  // Nothing usable came back: pass the provider error through.
  if (!aData && !rData) {
    const failed = [a, r].find((x) => x.status === "rejected");
    return handleError(res, failed.reason);
  }

  const series = {
    ...(aData ?? {}),
    ...(rData ? ranobedbFields(rData) : {}),
  };

  return res.json({
    bookId: req.book.id,
    series,
    ...(Object.keys(errors).length && { errors }),
  });
});

module.exports = router;