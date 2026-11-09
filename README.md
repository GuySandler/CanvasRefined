# Landing page

This is the source code of the landing page hosted on Github Pages: https://guysandler.github.io/CanvasRefined/

## Files

- `index.html` — the whole site (inline CSS, inline carousel JS, JSON-LD structured data)
- `og-image.jpg` — 1200×630 social preview image (`og:image` / `twitter:image`)
- `robots.txt`, `sitemap.xml` — crawler directives and the single-URL sitemap
- `google6489c5fd3680dc8f.html` — Google Search Console verification
- `icon/`, `images/` — logos, favicons and feature screenshots (`.webp`)

## SEO notes

- Canonical URL, Open Graph and Twitter Card tags are hardcoded to
  `https://guysandler.github.io/CanvasRefined/`. If a custom domain is added,
  update `index.html` (canonical, `og:url`, `og:image`, JSON-LD `@id`s),
  `robots.txt` and `sitemap.xml`.
- Structured data is a single `@graph` with `WebSite`, `SoftwareApplication`
  (including `aggregateRating` from the Chrome Web Store + Firefox Add-ons
  listings), `Organization` and `FAQPage`. Keep the FAQ answers in the visible
  section and in the JSON-LD in sync, and keep `ratingCount` in step with the
  store numbers (currently 18 Chrome + 10 Firefox).
- When the FAQ or a feature changes, also bump `<lastmod>` in `sitemap.xml`.
