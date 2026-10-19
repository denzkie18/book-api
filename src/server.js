const express = require("express");
const booksRouter = require("./router/booksRouter");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Book API",
    endpoints: {
      books: "/api/novel",
      latest: "/api/novel/latest?page=1&perPage=10",
      bookById: "/api/novel/1016",
      anilist: "/api/novel/1016/anilist",
      ranobedb: "/api/novel/1016/ranobedb",
    },
  });
});

app.use("/api/novel", booksRouter);

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

// Start a listener only when run directly:
// node src/server.js
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Book API running at http://localhost:${PORT}`);
  });
}

// Vercel uses the exported app.
module.exports = app;
