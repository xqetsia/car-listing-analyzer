# Pain Points Log — Used Car Listing Analyzer

A running log of friction points hit while building this, so future-me remembers
why certain decisions were made. Add to this as the project grows.

---

## Car-data APIs are mostly gated now

- **Edmunds shut down its open Developer API.** Their help center confirms
  it's now restricted to existing strategic partners via an Account Executive
  — no self-serve signup. Not viable for a hackathon timeline, possibly not
  viable at all without a business relationship with Edmunds.
- Noted alternatives if structured market-value data is wanted later:
  NHTSA vPIC (free, VIN decode only, no pricing), or paid tiers like
  MarketCheck/CarMD.
- **Ended up not needing a car-data API at all** — the whole value of this
  tool is Gemini reading and reasoning over the *listing itself*, not
  cross-referencing a pricing database. Worth remembering before reaching for
  another API integration.

## Hosting constraint: GitHub Pages is static-only

- No backend = no place to hide the Gemini API key. Went in with eyes open:
  using a restricted/low-quota demo key embedded client-side, to be rotated
  out after judging. Not a long-term-safe pattern if this project continues
  past the hackathon.
- Also means no server-side scraping — client-side `fetch()` to arbitrary
  listing URLs would hit CORS almost everywhere.
- **Real fix, parked as a next step:** a static site genuinely cannot hide a
  secret — anything shipped in the frontend JS is visible to anyone who
  visits. The proper solution is a small serverless proxy in front of the
  Gemini API (e.g. a Cloudflare Worker): browser → proxy (holds the real key
  server-side, never committed anywhere) → Gemini API → back to browser.
  GitHub Pages stays fully static; only the `ENDPOINT` in `script.js` would
  change to point at the proxy instead of Google directly, and the whole
  `config.js` / gitignore dance goes away. Didn't build this for the
  hackathon — decided to demo locally off my own machine (`config.js` with
  a real key, never pushed) instead of exposing a key on the live GitHub
  Pages URL. Worth doing properly if this project continues past the demo.

## The actual scraping problem: solved via `url_context`, but inconsistent

- Gemini's built-in `url_context` tool fetches a page **server-side on
  Google's infra**, which neatly avoids both the CORS problem and the "no
  backend" problem. No separate scraping service needed.
- **But it doesn't work on every site.** Cars.com blocked it outright
  — got back a clean, well-formed response where the model itself reported
  it couldn't access the page (not a network/API error, a "soft failure"
  baked into the JSON output). Likely bot detection / JS-rendered content
  with nothing readable server-side.
- **Craigslist worked fine.** Simpler server-rendered HTML, less aggressive
  bot protection.
- Open question: which other listing sites (CarGurus, AutoTrader, Facebook
  Marketplace, dealer sites) will `url_context` actually reach? Worth testing
  a handful before assuming "paste a link" works broadly. This is probably
  the single biggest reliability risk in the whole project.
- Current mitigation: kept a "paste the listing text" fallback mode in the UI
  for exactly this reason. Should tighten the failure detection so a "soft
  failure" (model says it couldn't read the page) triggers the same fallback
  messaging as a hard fetch error, instead of silently rendering an empty
  "Unknown / Unknown / Unknown" report.
- **`url_context` doesn't reliably extract raw image URLs, even on pages it
  can read fine.** Confirmed on the working Craigslist listing: the tool
  successfully read all the text (year, make, model, price, condition
  details all came back correct), but `image_urls` came back empty even
  though the page has 4 real photos at predictable, publicly accessible URLs
  (`images.craigslist.org/...`). Seems like the tool is built to extract
  readable text content for grounding, not to surface raw asset URLs from the
  page's markup. Tried once, not worth more time right now — parked as a
  known gap rather than a bug. If picked back up later: worth testing a more
  forceful prompt, or pairing `url_context` with `google_search` to see if
  that changes anything, before assuming it's a hard limitation.
