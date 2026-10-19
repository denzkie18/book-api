const express = require("express");
const { books } = require("../data/novels.json");
const AnilistProvider = require("../providers/AnilistProvider");
const RanobeDBProvider = require("../providers/RanobeDBProvider");

const router = express.Router();

// GET /api/books
// GET /api/books?q=7th%20Time%20Loop
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

// Validate the local book ID and find the book.
// Runs for every route below containing :id.
router.param("id", (req, res, next, value) => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      message: "Book ID must be a positive integer.",
    });
  }

  const book = books.find((item) => item.id === id);

  if (!book) {
    return res.status(404).json({
      message: "Book not found.",
    });
  }

  req.book = book;
  next();
});

// GET /api/books/:id/anilist
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

// GET /api/books/:id/ranobedb
// :id is your LOCAL book ID.
router.get("/:id/ranobedb", async (req, res) => {
  // req.book is populated by your existing router.param("id", ...).
  const provider = req.book.bookProvider;

  if (!provider || provider.name?.toLowerCase() !== "ranobedb") {
    return res.status(404).json({
      message: "This book does not have a RanobeDB provider.",
    });
  }

  try {
    const ranobedb = await RanobeDBProvider.getBookById(provider.id);

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

// GET /api/books/latest?page=1&perPage=10
router.get("/latest", (req, res) => {
  const pageValue = req.query.page ?? "1";
  const perPageValue = req.query.perPage ?? "10";

  // Only accept positive whole-number query parameters.
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

  // Copy before sorting to avoid changing the original books array.
  const sortedBooks = [...books].sort((a, b) => b.id - a.id);

  const total = sortedBooks.length;
  const totalPages = Math.ceil(total / perPage);

  // Out-of-range pages return an empty array.
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

// GET /api/books/:id
router.get("/:id", (req, res) => {
  res.json(req.book);
});

module.exports = router;
