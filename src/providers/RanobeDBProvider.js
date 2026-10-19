const RANOBEDB_API_URL = "https://ranobedb.org/api/v0";

class RanobeDBProviderError extends Error {
  constructor(message, statusCode = 502, retryAfter = null) {
    super(message);
    this.name = "RanobeDBProviderError";
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

async function getBookById(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RanobeDBProviderError("Invalid RanobeDB book ID.", 400);
  }

  let response;

  try {
    response = await fetch(`${RANOBEDB_API_URL}/book/${id}`, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const timedOut =
      error.name === "TimeoutError" || error.name === "AbortError";

    throw new RanobeDBProviderError(
      timedOut
        ? "RanobeDB request timed out."
        : "Unable to connect to RanobeDB.",
      timedOut ? 504 : 502,
    );
  }

  if (response.status === 404) {
    throw new RanobeDBProviderError("Book not found on RanobeDB.", 404);
  }

  if (response.status === 429) {
    throw new RanobeDBProviderError(
      "RanobeDB rate limit reached. Try again later.",
      429,
      response.headers.get("retry-after"),
    );
  }

  if (!response.ok) {
    throw new RanobeDBProviderError(
      `RanobeDB returned HTTP ${response.status}.`,
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new RanobeDBProviderError("RanobeDB returned invalid JSON.");
  }

  // Extract the book from the response wrapper.
  const book = payload?.book;

  if (!book || typeof book !== "object" || book.id !== id) {
    throw new RanobeDBProviderError(
      "RanobeDB returned an unexpected book response.",
    );
  }

  return book;
}

module.exports = {
  getBookById,
};
