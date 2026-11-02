# Popular and trending: volume 1 only

This patch builds on the previously supplied enhanced Novel API. Copy these files into your project root, preserving paths. Files with the same paths are replaced; review and merge any changes you have made since the enhanced project. The patch contains both popular/trending endpoints and the volume-1-only update. Your catalog (`src/data/novels.json`), Vercel configuration, and other files are not included or changed. Ensure the catalog has unique local IDs; see README.md's catalog migration section.

Run `npm test` and deploy. Popular and trending now return only local entries whose volume is exactly 1. They do not substitute later volumes when volume 1 is missing. Filtering happens before ranking and pagination. AniList scores are series-level; distinct volume-1 records may share a score. Latest, browse and detail routes are unchanged. Filters, caching, error handling and the response shapes remain as documented in README.md.

Verification: 18 deterministic tests passed. Live checks of popular, trending, and genre-filtered trending returned HTTP 200, only volume 1, and no metadata warnings at the time of testing.
