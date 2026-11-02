# AniList native popular and trending rankings

This patch builds on the previously supplied enhanced Novel API. Copy these files into your project root, preserving paths. Review and merge any files you have changed since the enhanced project. This patch includes the popular/trending routes, volume-1 filtering, and AniList native sorting. It does not include or modify your catalog (`src/data/novels.json`), Vercel configuration, or other files. Ensure the catalog has unique local IDs; see README.md's catalog migration section.

Run `npm test` and deploy. `/api/v0/novel/popular` uses AniList `POPULARITY_DESC`, and `/api/v0/novel/trending` uses `TRENDING_DESC`. AniList is queried with all relevant catalog IDs using `id_in`; its sorted results are paginated fully before local pagination. Only local volume 1 books are returned; missing volume 1 entries are not substituted. Results preserve AniList's series ordering; distinct local records for the same series tie-break by local ID. Cache and queue behavior are described in README.md.

Verification: 20 automated tests passed. Live checks of both routes and genre-filtered trending returned HTTP 200, volume-1-only results, and no metadata warnings at test time.
