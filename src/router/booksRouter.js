const express = require("express");
const { books } = require("../data/novels.json");
const AnilistProvider = require("../providers/AnilistProvider");
const RanobeDBProvider = require("../providers/RanobeDBProvider");
const loadBook = require("../middleware/loadBook");

const router = express.Router();

// GET /api/v0/novel
// GET /api/v0/novel?q=7th%20Time%20Loop
router.get("/", (req, res) => {
  const { q } = req.query;

  if (q !== undefined && typeof q !== "string") {
    return res.status(400).json({
      message: "The q parameter must be a string.",
    });
  }

  const search = (q || "").trim().toLowerCase();

  const results = books.filter((book) =>
    book.title.toLowerCase().includes(search),
  );

  res.json({
    total: results.length,
    books: results,
  });
});

// GET /api/v0/novel/latest?page=1&perPage=10
// Kept above the :id routes so "latest" is never treated as an ID.
router.get("/latest", (req, res) => {
  const pageValue = req.query.page ?? "1";
  const perPageValue = req.query.perPage ?? "10";

  if (
    typeof pageValue !== "string" ||
    typeof perPageValue !== "string" ||
    !/^[1-9]\d*$/.test(pageValue) ||
    !/^[1-9]\d*$/.test(perPageValue)
  ) {
    return res.status(400).json({
      message: "page and perPage must be positive integers.",
    });
  }

  const page = Number(pageValue);
  const perPage = Number(perPageValue);

  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(perPage) ||
    perPage > 100
  ) {
    return res.status(400).json({
      message:
        "page must be a safe positive integer and perPage must be between 1 and 100.",
    });
  }

  const sortedBooks = [...books].sort((a, b) => b.id - a.id);

  const total = sortedBooks.length;
  const totalPages = Math.ceil(total / perPage);

  const results =
    page > totalPages
      ? []
      : sortedBooks.slice((page - 1) * perPage, page * perPage);

  return res.json({
    page,
    perPage,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    books: results,
  });
});

// Validates the local book ID and sets req.book
router.param("id", loadBook);

// GET /api/v0/novel/:id/anilist
router.get("/:id/anilist", async (req, res) => {
  const provider = req.book.providers?.find(
    (item) => item.name?.toLowerCase() === "anilist",
  );

  if (!provider) {
    return res.status(404).json({
      message: "This book does not have an AniList provider.",
    });
  }

  try {
    const anilist = await AnilistProvider.getNovelById(provider.id);

    return res.json({
      bookId: req.book.id,
      anilist,
    });
  } catch (error) {
    console.error("AniList request failed:", error.message);

    if (error.retryAfter) {
      res.set("Retry-After", error.retryAfter);
    }

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "An unexpected error occurred.",
    });
  }
});

// GET /api/v0/novel/:id/ranobedb
router.get("/:id/ranobedb", async (req, res) => {
  const provider = req.book.bookProvider;

  if (!provider || provider.name?.toLowerCase() !== "ranobedb") {
    return res.status(404).json({
      message: "This book does not have a RanobeDB provider.",
    });
  }

  try {
    const ranobedb = await RanobeDBProvider.getBookById(provider.id, "book");

    return res.json({
      bookId: req.book.id,
      ranobedb,
    });
  } catch (error) {
    console.error("RanobeDB request failed:", error.message);

    if (error.retryAfter) {
      res.set("Retry-After", error.retryAfter);
    }

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "An unexpected error occurred.",
    });
  }
});

// GET /api/v0/novel/:id
router.get("/:id", (req, res) => {
  res.json(req.book);
});

module.exports = router;