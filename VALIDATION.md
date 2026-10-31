# Validation

- 15/15 deterministic Node regression tests passed.
- Live upstream smoke checks passed for latest enrichment, combined AniList genre/tag filtering, and single-series detail.
- Real API browser checks passed at 1280 px desktop and 390 px mobile, with no horizontal overflow or JavaScript errors.
- Visually inspected book cards, raw JSON, empty results, missing-book errors, and dark-mode series/error states.
- These are point-in-time checks, not a guarantee of upstream availability or immunity to shared-IP rate limits.

Re-run `npm test` and optionally `npm run test:live` after making changes.
