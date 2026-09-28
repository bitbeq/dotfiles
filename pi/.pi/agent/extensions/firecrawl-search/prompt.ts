import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@earendil-works/pi-coding-agent";

const OUTPUT_LIMIT = `${formatSize(DEFAULT_MAX_BYTES)} or ${DEFAULT_MAX_LINES} lines`;

export const SEARCH_DESCRIPTION =
  `Search the current web, news, or images through the self-hosted Firecrawl service. ` +
  `Can optionally scrape result pages as markdown. Output is limited to ${OUTPUT_LIMIT}; ` +
  "complete truncated output is saved to a temporary file.";

export const SEARCH_SNIPPET =
  "Search the current web through the self-hosted Firecrawl service";

export const SEARCH_GUIDELINES = [
  "Use firecrawl_search when the user asks for current web information, external documentation, recent changes, or cited sources beyond the workspace.",
  "Use firecrawl_scrape after firecrawl_search when full readable content from one result is needed.",
  "Keep firecrawl_search scrapeResults false for discovery; enable it only when content from every returned result is necessary.",
];

export const SCRAPE_DESCRIPTION =
  `Fetch one URL through Firecrawl and return cleaned markdown. Output is limited to ${OUTPUT_LIMIT}; ` +
  "complete truncated output is saved to a temporary file.";

export const SCRAPE_SNIPPET =
  "Fetch one web page as cleaned markdown through Firecrawl";

export const SCRAPE_GUIDELINES = [
  "Use firecrawl_scrape for the full readable content of one known web URL.",
  "Prefer firecrawl_scrape over bash or raw HTTP for ordinary web pages because it returns cleaned markdown.",
  "Use firecrawl_crawl instead of firecrawl_scrape when multiple related pages from one site are needed.",
];

export const CRAWL_DESCRIPTION =
  `Crawl up to 100 pages from one website through Firecrawl and return cleaned markdown documents. ` +
  `Output is limited to ${OUTPUT_LIMIT}; complete truncated output is saved to a temporary file.`;

export const CRAWL_SNIPPET =
  "Crawl multiple related web pages through Firecrawl";

export const CRAWL_GUIDELINES = [
  "Use firecrawl_crawl only when content from multiple related pages on one website is needed.",
  "Keep firecrawl_crawl limits and path filters as narrow as practical to reduce load on the self-hosted service.",
  "Use firecrawl_scrape rather than firecrawl_crawl for one known URL.",
];
