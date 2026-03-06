# Freshness Web Lookup

When provider descriptions (Hotelbeds `provider_raw`) contain no opening/renovation info, we can optionally perform a **web lookup** to find this data. The goal is **robustness**: only persist when we have high confidence from verifiable sources.

## Flow

1. **Provider extraction first**: Run `collect-text` + `extract-with-ai` on `provider_raw`.
2. **Web lookup fallback**: If `opening_year` and `last_major_renovation_year` are both null, and `FRESHNESS_WEB_LOOKUP=true`, search the web via Brave Search API.
3. **AI extraction with provenance**: Claude extracts years from search snippets and must cite exact URL + phrase for each claim.
4. **Strict persistence**: Only update `properties` when:
   - `confidence === "high"`
   - At least one source is from a trusted domain (Wikipedia, official hotel site, major OTA, news)
5. **Audit trail**: Sources are stored in `property_renovation_texts` for verification.

## Env Variables

| Variable | Description |
|----------|--------------|
| `FRESHNESS_WEB_LOOKUP` | `true` to enable web lookup when provider text has no years |
| `BRAVE_API_KEY` | Brave Search API key. Free tier: $5/month credits. |
| `ANTHROPIC_API_KEY` | Required for AI extraction |

## Trusted Domains

We downgrade confidence to "medium" if no source is from a trusted domain. Trusted domains include:

- wikipedia.org, wikidata.org
- booking.com, tripadvisor, hotels.com
- Major chains: marriott, hilton, ihg, accor, hyatt, etc.
- News: reuters, bloomberg, travelweekly, hotelnewsnow
- .gov

## Usage

```bash
# Enable web lookup (requires BRAVE_API_KEY)
FRESHNESS_WEB_LOOKUP=true BRAVE_API_KEY=xxx ANTHROPIC_API_KEY=xxx npm run freshness:extract
```

## Costs

- **Brave Search**: ~$5/1000 requests. 4 queries per hotel (different search terms) = ~4 requests per hotel. $5 free monthly credits.
- **Claude**: Same as description extraction; one extra call per hotel when web lookup runs.
