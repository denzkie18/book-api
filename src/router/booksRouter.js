const express = require("express");
const { books } = require("../data/novels.json");
const loadBook = require("../middleware/loadBook");
const { parseGenres, filterByGenres } = require("../utils/genres");
const { onePerSeries } = require("../utils/seriesBooks");

const router = express.Router();
// GET /api/v0/novel
// GET /api/v0/novel?q=7th%20Time%20Loop
// GET /api/v0/novel?genres=fantasy,romance&match=any
router.get("/", (req, res) => {
    const { q, genres, match } = req.query;

    if (q !== undefined && typeof q !== "string") {
        return res.status(400).json({
            message: "The q parameter must be a string."
        });
    }

    if (genres !== undefined && typeof genres !== "string") {
        return res.status(400).json({
            message: "The genres parameter must be a comma-separated string."
        });
    }

    if (match !== undefined && match !== "all" && match !== "any") {
        return res.status(400).json({
            message: 'The match parameter must be "all" or "any".'
        });
    }

    const search = (q || "").trim().toLowerCase();

    let results = books.filter(book =>
        book.title.toLowerCase().includes(search)
    );

    const wanted = parseGenres(genres);

    if (wanted.length) {
        results = filterByGenres(results, wanted, match ?? "all");
    }

    // Searching by title or genres: one result per series, volume 1 first.
    if (search || wanted.length) {
        results = onePerSeries(results);
    }

    res.json({
        total: results.length,
        books: results
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
            message: "page and perPage must be positive integers."
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
                "page must be a safe positive integer and perPage must be between 1 and 100."
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
        books: results
    });
});

// Validates the local book ID and sets req.book
router.param("id", loadBook);

// GET /api/v0/novel/:id
router.get("/:id", (req, res) => {
    res.json(req.book);
});

module.exports = router;
