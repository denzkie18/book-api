const RANOBEDB_API_URL = "https://ranobedb.org/api/v0";

class RanobeDBProviderError extends Error {
  constructor(message, statusCode = 502, retryAfter = null) {
    super(message);
    this.name = "RanobeDBProviderError";
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

async function getBookById(id, requestType) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RanobeDBProviderError(`Invalid RanobeDB ${requestType} ID.`, 400);
  }

  let response;

  try {
    response = await fetch(`${RANOBEDB_API_URL}/${requestType}/${id}`, {
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
    throw new RanobeDBProviderError("Data not found on RanobeDB.", 404);
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

  // "series" requests are wrapped in { series }, "book" in { book }.
  const key = requestType === "series" ? "series" : "book";
  const item = payload?.[key];

  if (!item || typeof item !== "object" || item.id !== id) {
    throw new RanobeDBProviderError(
      "RanobeDB returned an unexpected data response.",
    );
  }

  return item;
}

module.exports = {
  getBookById,
};