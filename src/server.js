const express = require("express");
const booksRouter = require("./router/booksRouter");
const seriesRouter = require("./router/seriesInfoRouter.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Book API",
    endpoints: {
      books: "/api/v0/novel",
      latest: "/api/v0/novel/latest?page=1&perPage=10",
      bookById: "/api/v0/novel/1016",
      anilist: "/api/v0/novel/1016/anilist",
      ranobedb: "/api/v0/novel/1016/ranobedb",
      series: "/api/v0/novel/series/1016",
    },
  });
});

// Specific path first, otherwise "series" gets matched as a book :id.
app.use("/api/v0/novel/series", seriesRouter);
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