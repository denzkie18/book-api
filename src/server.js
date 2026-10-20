const express = require("express");
const booksRouter = require("./router/booksRouter");
const seriesRouter = require("./router/seriesInfoRouter.js");
const bookRouter = require("./router/bookInfoRouter");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "public")));

// Specific path first, otherwise "series" gets matched as a book :id.
app.use("/api/v0/novel/series", seriesRouter);
app.use("/api/v0/novel/book", bookRouter);
app.use("/api/v0/novel", booksRouter);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

// Unexpected errors
app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Book API running at http://localhost:${PORT}`);
  });
}

module.exports = app;