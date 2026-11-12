# Novel API · Explorer

A runnable Node.js/Express project using the supplied catalog, with an HTML live-request playground at `/`.

## Run

Requires Node.js 20+ and npm. No API keys are required.

```sh
npm ci
npm start
# Open http://localhost:3000
```

`PORT=8080 npm start` changes the port. Run `npm test` for deterministic mocked-upstream regression tests. `npm run test:live` checks the real public providers and can fail if a provider is unavailable or rate-limited.

## Deploy your own

[

![Deploy with Vercel](https://vercel.com/button)

](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdenzkie18%2Fbook-api)

### Host it on Vercel

**One click**
1. Click the **Deploy with Vercel** button above.
2. Sign in with GitHub, GitLab or Bitbucket.
3. Vercel copies the repo to your account. Keep the defaults and click **Deploy**.
4. In about a minute you get a live URL. The explorer is at `/`.

No environment variables or API keys are needed.

**From your own fork**
1. Fork this repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import your fork.
3. Click **Deploy**.

**With the CLI**
```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

> **Note:** On Vercel, the in-memory cache and request pacing reset whenever a serverless instance restarts. For heavy traffic, use a long-running host (Render, Railway, Fly.io) instead.

## Routes

| GET route | Purpose |
| --- | --- |
| `/api/v0/novel/latest` | Latest locally added volumes, descending local ID |
| `/api/v0/novel/popular` | Catalog volume 1 books ranked by AniList popularity |
| `/api/v0/novel/trending` | Catalog volume 1 books ranked by AniList trending |
| `/api/v0/novel` | Browse/search/filter the local catalog |
| `/api/v0/novel/:id` | One enriched book, in `{ book, warnings? }` |
| `/api/v0/novel/book/:id` | Rich AniList book detail, RanobeDB description, related local volumes |
| `/api/v0/novel/series/:id` | Rich series metadata and deduplicated local volumes |

All `:id` values are **local catalog book IDs**, including on the series endpoint. They are not AniList or RanobeDB IDs. The catalog, not AniList's entire library, defines which books are returned.

### List query parameters

- `q`: case-insensitive local title search, up to 200 characters.
- `genres`: AniList genre name(s), case-insensitive.
- `tags`: AniList tag name(s), case-insensitive.
- `match=all` (default) or `match=any`: applies within the genre group and within the tag group. When both groups are supplied, **both groups must match**.
- `page=1`, `perPage=10`: positive integers; `perPage` capped at 100.

Supported filter syntax: `genres=Romance`, `genres=Romance,Drama`, `genres=[romance,drama]`, `genres=["Romance","Drama"]`, or repeated `genres=Romance&genres=Drama`. Tags use the same parser. Names can include spaces, e.g. `tags=Female Protagonist`. At most 20 names per filter, each up to 100 characters. URL-encode query values in real HTTP clients; examples below use `--data-urlencode`.

```sh
curl 'http://localhost:3000/api/v0/novel/latest?page=1&perPage=6'

curl 'http://localhost:3000/api/v0/novel/popular?page=1&perPage=6'

curl -G 'http://localhost:3000/api/v0/novel/trending' --data-urlencode 'genres=Romance,Drama' --data-urlencode 'perPage=6'

curl -G 'http://localhost:3000/api/v0/novel' \
  --data-urlencode 'genres=[fantasy,adventure]' \
  --data-urlencode 'tags=Female Protagonist' \
  --data-urlencode 'match=all'

curl -G 'http://localhost:3000/api/v0/novel/latest' \
  --data-urlencode 'genres=Fantasy,Romance' \
  --data-urlencode 'match=any'

curl 'http://localhost:3000/api/v0/novel/series/1059'
```

Browse with a title or genre/tag filter returns one representative volume per RanobeDB series (AniList as fallback), preferring the lowest volume. Latest always returns individual volumes, even with filters. Unfiltered browse returns all unique volumes. Both list routes paginate; `total` is the count **after filtering/deduplication and before pagination**. Out-of-range pages return an empty `books` array. Latest retains the original **local ID ordering**, not a global publication-date ranking.

Popular and trending fetch AniList metrics only for IDs referenced in `src/data/novels.json` (the local catalog); they do not return entries from AniList's global charts that aren't in that file. AniList receives the full set of catalog volume-1 IDs using `id_in` and native `POPULARITY_DESC` or `TRENDING_DESC` sorting; all AniList pages are fetched before local pagination. Only catalog entries whose volume is exactly 1 are returned, deduplicated by provider book identity. Series without a cataloged volume 1 are excluded rather than substituted with a later volume; distinct volume-1 records can still share a series score. AniList determines the ordering of tied series; multiple local volume-1 records for the same AniList series use ascending local ID. Records without an AniList mapping or the relevant metric are excluded; a score of zero is valid. Popular uses AniList `popularity`; trending uses AniList `trending`, which is a current activity indicator, not an all-time popularity count. Ranked routes fail with the provider status if AniList cannot be reached, rather than returning an incorrect ranking. Filters apply before ranking. Their metadata is cached in-process for one hour and can therefore lag AniList.

## Compact book contract

Latest, browse, popular, and `/novel/:id` books contain exactly these 14 keys. Trending returns the same keys plus `trending` (the AniList activity metric). Pagination and partial-failure warnings live outside the book object. No cloud storage IDs, provider payloads, tags, or other fields leak into this projection.

| Key | Type / source |
| --- | --- |
| `id` | number; local book ID |
| `title` | string; local title |
| `cover_url` | string or null; local cover URL |
| `publisher_name` | string or null; local publisher names, comma-joined if multiple |
| `volume` | number or null; local volume |
| `anilist_id` | number or null; local AniList series mapping |
| `ranobidb_id` | number or null; local RanobeDB **series** mapping (requested spelling) |
| `book_provider_id` | number or null; local individual RanobeDB **book** mapping |
| `description` | string or null; RanobeDB book description only, not AniList's series synopsis |
| `genres` | string array; AniList, empty if unavailable |
| `popularity` | number or null; AniList |
| `weighted_score` | number or null; AniList `averageScore`, 0–100 weighted score; not `meanScore`, not a custom formula |
| `published_date` | ISO `YYYY-MM-DD` or null; RanobeDB `c_release_dates.en`, falling back to `c_release_date` when English date is absent |
| `color` | hex string or null; AniList `coverImage.color` |

Unknown or partial publication dates return null rather than inventing a day. Rich `/book/:id` and `/series/:id` preserve their original full-detail response shape. Their sibling `books` summaries now use `cover_url` instead of `coverUrl`, and add `book_provider_id` for unambiguous volume identity.

### Partial metadata

List/detail projection requests can return HTTP 200 with `warnings` if an upstream is unavailable. Missing upstream data stays null/empty; descriptions are not silently replaced with AniList text. **Filter requests fail with the upstream status instead of silently returning zero or unfiltered matches** when AniList cannot be queried. A provider 429 is forwarded with `Retry-After` on failures; partial-response warnings include `retry_after` where provided. Full-detail endpoints keep their existing `errors` reporting.

## Duplicate fixes and catalog migration

The input has 69 records representing 62 provider-book identities, including seven repeated records for 7th Time Loop. Repeated provider-book identities are collapsed in listings and series results, never solely by title or local ID. Distinct volumes remain separate; series volume summaries sort by volume, then ID. Existing duplicate aliases are retained for detail links. When exact provider-book records repeat, the last source record wins (in this dataset it carries the more specific metadata).

Two local IDs were also assigned to different volumes. The bundled catalog fixes **only those collisions**, preserving the lower-volume record's old ID:

| Old ID | Volume reassigned | New ID |
| --- | --- | --- |
| 1057 | A Tale of the Secret Saint, volume 10 | 1068 |
| 1059 | A Tale of the Secret Saint, volume 11 | 1069 |

`id-migration.json` records the changes, including upstream book IDs. Because the old IDs were ambiguous, existing clients that intended the reassigned volumes must use the new IDs. No ID scheme can preserve both meanings of an already-reused ID. The migration also moves these two records to the front of the ID-ordered latest list. Catalog validation fails on startup if new local ID collisions are introduced; the API will not silently discard a distinct volume.

## Rate-limit protection

- Only AniList metadata is fetched to evaluate filters; local `genres` are not trusted for matching.
- For filters, summary queries load up to 50 **unique series IDs** per GraphQL POST. Ranked queries instead pass the whole ID set to AniList, sort there and page through results 50 at a time to preserve native ordering. Only the selected local page's RanobeDB descriptions are fetched.
- AniList detail/summary requests share a process-wide serial queue with a 2.2-second minimum request-start interval (under 28/minute). This is a conservative default, **not a guarantee** against shared-IP or changed upstream limits.
- AniList detail/summary cache: 1 hour; RanobeDB book/series cache: 6 hours; bounded to 2,000 entries per provider. Cache and in-flight requests are shared within the Node process. Identical concurrent batches and ranked ID-set requests are coalesced. Ranked sets are cached for one hour per process. Failures are not cached as successful data.
- AniList `X-RateLimit-Remaining` / `X-RateLimit-Reset` and upstream `Retry-After` are honored. A 429 starts a shared cooldown. No automatic retry storm occurs; requests during cooldown fail fast, while cached values remain usable.
- RanobeDB calls are also serialized and paced (350 ms); only four book enrichment jobs are queued at once per request.
- Each upstream request times out after 10 seconds. The UI permits up to 120 seconds overall; prefer smaller pages on cold caches.

Caches/queues are in memory and reset on restart. Multiple replicas/workers or other applications sharing an egress IP need a shared external cache/limiter before production scale. These protections do not override upstream limits or provider availability.

## UI

The new `public/` interface supports actual same-origin fetch requests, 650 ms debounced live mode, manual send, title/genre/tag controls, list pagination, popular/trending and series/book endpoint selection, cards, raw JSON, copy JSON, elapsed time, partial-metadata notices, and loading/empty/error states. Stale responses are canceled/ignored. Provider text is inserted with `textContent`, never trusted as HTML. The layout adapts to mobile, follows system light/dark theme, and respects reduced motion. No external UI framework or build step is required.

No original HTML was attached, so `public/index.html`, `styles.css`, and `app.js` are a new replacement playground rather than edits to an existing page.

## Project layout

```
public/                  responsive API explorer
src/server.js            Express application + static hosting
src/router/              catalog, rich book, rich series routes
src/providers/           AniList + RanobeDB clients
src/utils/               caching, pacing, projection, identity, filters
src/data/novels.json      supplied catalog with two ID-collision repairs
src/middleware/          local ID validation/lookup
scripts/live-smoke.js     opt-in real upstream checks
test/                    node:test regression suite
id-migration.json        explicit record of ID changes
```
