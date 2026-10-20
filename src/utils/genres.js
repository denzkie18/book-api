// "Drama, romance" -> ["drama", "romance"]
function parseGenres(value) {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

// mode "all": book needs every wanted genre. mode "any": at least one.
function filterByGenres(list, wanted, mode = "all") {
  return list.filter((book) => {
    const have = new Set((book.genres ?? []).map((g) => g.toLowerCase()));

    return mode === "any"
      ? wanted.some((g) => have.has(g))
      : wanted.every((g) => have.has(g));
  });
}

module.exports = { parseGenres, filterByGenres };