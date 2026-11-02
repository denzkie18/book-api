const { createClient, ProviderError } = require("../utils/providerClient");
const client = createClient({ name: "AniList", url: "https://graphql.anilist.co", interval: 2200 });

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
      }
      siteUrl
    }
  }
`;

const batchFlights = new Map();
const SUMMARY_FIELDS = `id genres tags { name } popularity trending averageScore coverImage { color }`;
function validId(id) {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new ProviderError("Invalid AniList ID.", 400);
}
async function getNovelById(id) {
  validId(id);
  return client.cached(`detail:${id}`, async () => {
    const payload = await client.request('', { query: NOVEL_QUERY, variables: { id } });
    if (!payload.data?.Media) throw new ProviderError("Novel not found on AniList.", 404);
    client.put(`summary:${id}`, payload.data.Media);
    return payload.data.Media;
  });
}
// Sorted ID-set caching collapses concurrent catalog/filter requests. A Page
// returns up to 50 NOVEL records per POST, not one request per local volume.
async function getNovelSummaries(ids) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  unique.forEach(validId);
  if (!unique.length) return new Map();
  const missing = unique.filter(id => client.peek(`summary:${id}`) === undefined);
  if (missing.length) {
    const key = missing.join(',');
    if (!batchFlights.has(key)) batchFlights.set(key, (async () => {
    for (let offset = 0; offset < missing.length; offset += 50) {
      const chunk = missing.slice(offset, offset + 50);
      const payload = await client.request('', {
        query: `query CatalogNovels($ids:[Int]) { Page(page:1, perPage:50) { media(id_in:$ids,type:MANGA,format:NOVEL) { ${SUMMARY_FIELDS} } } }`,
        variables: { ids: chunk },
      });
      if (!Array.isArray(payload.data?.Page?.media)) throw new ProviderError("AniList returned an unexpected catalog response.");
      const found = new Map(payload.data.Page.media.map(item => [item.id, item]));
      for (const id of chunk) client.put(`summary:${id}`, found.get(id) ?? null);
    }
    })().finally(() => batchFlights.delete(key)));
    await batchFlights.get(key);
  }
  return new Map(unique.map(id => [id, client.peek(`summary:${id}`) ?? null]));
}
// Ask AniList to sort the *whole catalog ID set*, paginating the sorted
// response before local filtering/pagination. Never sort separate ID chunks.
async function getRankedNovelSummaries(ids, sort) {
  if (!['POPULARITY_DESC', 'TRENDING_DESC'].includes(sort)) throw new ProviderError('Invalid AniList sort.', 400);
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  unique.forEach(validId);
  if (!unique.length) return [];
  return client.cached(`ranked:${sort}:${unique.join(',')}`, async () => {
    const results = [], seen = new Set(), allowed = new Set(unique);
    for (let page = 1; page <= unique.length + 1; page++) {
      const payload = await client.request('', {
        query: `query RankedCatalogNovels($ids:[Int], $page:Int, $sort:MediaSort!) { Page(page:$page, perPage:50) { pageInfo { hasNextPage } media(id_in:$ids,type:MANGA,format:NOVEL,sort:[$sort]) { ${SUMMARY_FIELDS} } } }`,
        variables: { ids: unique, page, sort },
      });
      const data = payload.data?.Page;
      if (!Array.isArray(data?.media) || typeof data.pageInfo?.hasNextPage !== 'boolean') throw new ProviderError('AniList returned an unexpected ranked response.');
      for (const item of data.media) {
        if (!allowed.has(item?.id)) throw new ProviderError('AniList returned a novel outside the requested catalog.');
        if (!seen.has(item.id)) { seen.add(item.id); results.push(item); client.put(`summary:${item.id}`, item); }
      }
      if (!data.pageInfo.hasNextPage) return results;
      if (!data.media.length) throw new ProviderError('AniList returned an incomplete ranked response.');
    }
    throw new ProviderError('AniList returned too many ranked pages.');
  });
}
module.exports = { getNovelById, getNovelSummaries, getRankedNovelSummaries };
