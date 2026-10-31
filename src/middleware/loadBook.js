const { books } = require("../utils/catalog");

module.exports = function loadBook(req, res, next, value) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res
            .status(400)
            .json({ message: "Book ID must be a positive integer." });
    }

    const book = books.find(item => item.id === id);
    if (!book) {
        return res.status(404).json({ message: "Book not found." });
    }

    req.book = book;
    next();
};
