const ANILIST_API_URL = "https://graphql.anilist.co";

const NOVEL_QUERY = `
  query GetNovel($id: Int!) {
    Media(id: $id, type: MANGA, format: NOVEL) {
      id
      idMal
      title {
        romaji
        english
        userPreferred
      }
      coverImage {
        medium
        large
        extraLarge
        color
      }
      bannerImage
      status
      format
      staff {
        edges {
          id
          role
          node {
            id
            name {
              first
              middle
              last
              full
              userPreferred
            }
            languageV2
            image {
              medium
              large
            }
            description
            primaryOccupations
            gender
            dateOfBirth {
              day
              month
              year
            }
            dateOfDeath {
              day
              month
              year
            }
            age
            homeTown
            bloodType
          }
        }
      }
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      volumes
      chapters
      genres
      tags {
        id
        name
        description
        category
        rank
      }
      isLicensed
      description
      seasonYear
      countryOfOrigin
      source
      trailer {
        id
        site
        thumbnail
      }
      updatedAt
      averageScore
      meanScore
      popularity
      trending
      favourites
      relations {
        edges {
          id
          relationType
          node {
            id
            title {
              english
              native
              romaji
              userPreferred
            }
            type
            format
            status
            coverImage {
              medium
              large
              extraLarge
              color
            }
          }
        }
      }
      characters {
        edges {
          id
          role
          node {
            id
            name {
              first
              middle
              last
              full
              userPreferred
            }
            image {
              medium
              large
            }
          }
        }
      }
      externalLinks {
        id
        url
        site
        type
        language
        color
        icon
        notes
        isDisabled
      }
      rankings {
        id
        rank
        type
        format
        year
        season
        allTime
        context
      }
      reviews {
        edges {
          node {
            id
            userId
            mediaId
            mediaType
            summary
            body
            rating
            ratingAmount
            userRating
            score
            siteUrl
            createdAt
            updatedAt
            user {
              id
              name
              about
              avatar {
                large
                medium
                
              }
              bannerImage

            }
          }
        }
      }
      recommendations {
        edges {
          node {
            id
            rating
            userRating
            mediaRecommendation {
              id
              title {
                english
                native
                romaji
                userPreferred
              }
              idMal
              coverImage {
                large
                medium
                extraLarge
                color
              }
              type
              format
            }
          }
        }
      }
      stats {
        scoreDistribution {
          score
          amount
        }
        scoreDistribution {
          score
          amount
        }
      }
      siteUrl
    }
  }
`;

class AnilistProviderError extends Error {
  constructor(message, statusCode = 502, retryAfter = null) {
    super(message);
    this.name = "AnilistProviderError";
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

async function getNovelById(id) {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw new AnilistProviderError("Invalid AniList ID.", 400);
  }

  let response;

  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: NOVEL_QUERY,
        variables: { id },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const timedOut =
      error.name === "TimeoutError" || error.name === "AbortError";

    throw new AnilistProviderError(
      timedOut ? "AniList request timed out." : "Unable to connect to AniList.",
      timedOut ? 504 : 502,
    );
  }

  if (response.status === 429) {
    throw new AnilistProviderError(
      "AniList rate limit reached. Try again later.",
      429,
      response.headers.get("retry-after"),
    );
  }

  if (response.status === 404) {
    throw new AnilistProviderError("Novel not found on AniList.", 404);
  }

  if (!response.ok) {
    throw new AnilistProviderError(`AniList returned HTTP ${response.status}.`);
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new AnilistProviderError("AniList returned invalid JSON.");
  }

  // GraphQL can return errors even with HTTP 200.
  if (payload.errors?.length) {
    const notFound = payload.errors.some(
      (error) => Number(error.status) === 404,
    );

    throw new AnilistProviderError(
      notFound
        ? "Novel not found on AniList."
        : "AniList could not complete the query.",
      notFound ? 404 : 502,
    );
  }

  if (!payload.data?.Media) {
    throw new AnilistProviderError("Novel not found on AniList.", 404);
  }

  return payload.data.Media;
}

module.exports = {
  getNovelById,
};
