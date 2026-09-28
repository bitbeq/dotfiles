# firecrawl-search

Global Pi extension for the self-hosted Firecrawl instance at
`https://firecrawl.bitbeq.com`.

## Tools

- `firecrawl_search` — web, news, and image discovery, with optional result scraping
- `firecrawl_scrape` — one URL as cleaned markdown
- `firecrawl_crawl` — multiple related pages as cleaned markdown

Tool names are namespaced to avoid collisions with Pi or other extensions.
All tool output is capped at Pi's 50KB/2000-line context limit. Complete output is
written to a private temporary file when truncation is necessary. Crawl jobs are
cancelled on interruption or timeout.

## Configuration

No configuration is needed for this homelab deployment because its URL is the
extension default and `USE_DB_AUTHENTICATION=false` permits keyless requests.
Optional environment overrides:

```bash
export FIRECRAWL_API_URL="https://firecrawl.bitbeq.com"
export FIRECRAWL_API_KEY="..." # only if Firecrawl authentication is enabled later
```

`FIRECRAWL_API_URL` must be the API root, without `/v1` or `/v2`.
Restart Pi after changing environment variables.

The Firecrawl database password and Bull auth key are server-internal secrets;
they are intentionally not used or stored by this extension.

## Development

```bash
cd ~/.pi/agent/extensions/firecrawl-search
npm test
```

The tests use a local mock HTTP server and do not contact the homelab instance.
Use `/reload` in Pi after editing the extension.
