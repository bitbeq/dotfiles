import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  FirecrawlClient,
  type FirecrawlCrawlJob,
  type FirecrawlDocument,
  loadFirecrawlConfig,
} from "./client.ts";
import {
  CRAWL_DESCRIPTION,
  CRAWL_GUIDELINES,
  CRAWL_SNIPPET,
  SCRAPE_DESCRIPTION,
  SCRAPE_GUIDELINES,
  SCRAPE_SNIPPET,
  SEARCH_DESCRIPTION,
  SEARCH_GUIDELINES,
  SEARCH_SNIPPET,
} from "./prompt.ts";

interface FormattedOutput {
  text: string;
  truncated: boolean;
  fullOutputPath?: string;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function formatOutput(
  output: string,
  operation: string,
  extension: "json" | "md",
): Promise<FormattedOutput> {
  const truncation = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncation.truncated) {
    return { text: output, truncated: false };
  }

  const directory = await mkdtemp(join(tmpdir(), "pi-firecrawl-"));
  const fullOutputPath = join(directory, `${operation}.${extension}`);
  await writeFile(fullOutputPath, output, { encoding: "utf8", mode: 0o600 });

  const notice =
    `[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines ` +
    `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ` +
    `Full output saved to: ${fullOutputPath}]`;

  return {
    text: `${truncation.content}\n\n${notice}`,
    truncated: true,
    fullOutputPath,
  };
}

function countSearchResults(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  return Object.values(data).reduce(
    (count, value) => count + (Array.isArray(value) ? value.length : 0),
    0,
  );
}

function compactMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const source = metadata as Record<string, unknown>;
  return {
    title: source.title,
    sourceURL: source.sourceURL ?? source.url,
    statusCode: source.statusCode,
    contentType: source.contentType,
    creditsUsed: source.creditsUsed,
  };
}

function formatCrawl(job: FirecrawlCrawlJob): string {
  const header = [
    `# Firecrawl crawl: ${job.status}`,
    "",
    `Pages: ${job.data.length}`,
    `Completed: ${job.completed}/${job.total}`,
    job.creditsUsed === undefined ? undefined : `Credits used: ${job.creditsUsed}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const documents = job.data.map((document, index) => {
    const metadata = document.metadata ?? {};
    const title = typeof metadata.title === "string" ? metadata.title : `Page ${index + 1}`;
    const url = metadata.sourceURL ?? metadata.url;
    const markdown = document.markdown?.trim() || "_No markdown content returned._";
    return [
      `## ${index + 1}. ${title}`,
      typeof url === "string" ? `Source: ${url}` : undefined,
      "",
      markdown,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
  });

  return `${header}\n\n${documents.join("\n\n---\n\n")}`;
}

function operationError(operation: string, error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Firecrawl ")) return error;
  return new Error(`Firecrawl ${operation} failed: ${messageOf(error)}`, {
    cause: error,
  });
}

export default function firecrawlSearch(pi: ExtensionAPI) {
  const createClient = () => new FirecrawlClient(loadFirecrawlConfig());

  pi.registerTool({
    name: "firecrawl_search",
    label: "Firecrawl Search",
    description: SEARCH_DESCRIPTION,
    promptSnippet: SEARCH_SNIPPET,
    promptGuidelines: SEARCH_GUIDELINES,
    parameters: Type.Object({
      query: Type.String({
        minLength: 1,
        description: "The web search query.",
      }),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 20,
          description: "Maximum results. Defaults to 5; maximum 20.",
        }),
      ),
      source: Type.Optional(
        StringEnum(["web", "news", "images"] as const, {
          description: "Search result source. Defaults to web.",
        }),
      ),
      scrapeResults: Type.Optional(
        Type.Boolean({
          description:
            "Include cleaned markdown from every result. Defaults to false; prefer firecrawl_scrape for one selected result.",
        }),
      ),
      includeDomains: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          maxItems: 20,
          description: "Only return results from these domains. Cannot be combined with excludeDomains.",
        }),
      ),
      excludeDomains: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          maxItems: 20,
          description: "Exclude results from these domains. Cannot be combined with includeDomains.",
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 5,
          maximum: 120,
          description: "Search timeout in seconds. Defaults to 30.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      try {
        const query = params.query.trim();
        onUpdate?.({
          content: [{ type: "text", text: `Searching Firecrawl for: ${query}` }],
          details: undefined,
        });

        const client = createClient();
        const response = await client.search(
          {
            query,
            limit: params.limit ?? 5,
            source: params.source ?? "web",
            scrapeResults: params.scrapeResults ?? false,
            includeDomains: params.includeDomains,
            excludeDomains: params.excludeDomains,
            timeoutMs: (params.timeoutSeconds ?? 30) * 1_000,
          },
          signal,
        );
        const formatted = await formatOutput(stringify(response), "search", "json");

        return {
          content: [{ type: "text", text: formatted.text }],
          details: {
            query,
            source: params.source ?? "web",
            resultCount: countSearchResults(response.data),
            requestId: response.id,
            creditsUsed: response.creditsUsed,
            truncated: formatted.truncated,
            fullOutputPath: formatted.fullOutputPath,
          },
        };
      } catch (error) {
        throw operationError("search", error);
      }
    },
  });

  pi.registerTool({
    name: "firecrawl_scrape",
    label: "Firecrawl Scrape",
    description: SCRAPE_DESCRIPTION,
    promptSnippet: SCRAPE_SNIPPET,
    promptGuidelines: SCRAPE_GUIDELINES,
    parameters: Type.Object({
      url: Type.String({
        minLength: 1,
        description: "The absolute http or https URL to scrape.",
      }),
      onlyMainContent: Type.Optional(
        Type.Boolean({
          description: "Extract only the page's main content. Defaults to true.",
        }),
      ),
      waitForMilliseconds: Type.Optional(
        Type.Integer({
          minimum: 0,
          maximum: 60_000,
          description: "Wait before capture for JavaScript-heavy pages. Defaults to 0 milliseconds.",
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 5,
          maximum: 120,
          description: "Scrape timeout in seconds. Defaults to 30.",
        }),
      ),
      includeMetadata: Type.Optional(
        Type.Boolean({
          description: "Append page metadata to the markdown. Defaults to false.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      try {
        const url = params.url.trim();
        onUpdate?.({
          content: [{ type: "text", text: `Scraping with Firecrawl: ${url}` }],
          details: undefined,
        });

        const client = createClient();
        const response = await client.scrape(
          {
            url,
            onlyMainContent: params.onlyMainContent ?? true,
            waitFor: params.waitForMilliseconds,
            timeoutMs: (params.timeoutSeconds ?? 30) * 1_000,
          },
          signal,
        );
        const document: FirecrawlDocument = response.data ?? {};
        const markdown = document.markdown?.trim() || "No markdown content returned.";
        const output = params.includeMetadata && document.metadata
          ? `${markdown}\n\n## Metadata\n\n\`\`\`json\n${stringify(document.metadata)}\n\`\`\``
          : markdown;
        const formatted = await formatOutput(output, "scrape", "md");

        return {
          content: [{ type: "text", text: formatted.text }],
          details: {
            url,
            metadata: compactMetadata(document.metadata),
            truncated: formatted.truncated,
            fullOutputPath: formatted.fullOutputPath,
          },
        };
      } catch (error) {
        throw operationError("scrape", error);
      }
    },
  });

  pi.registerTool({
    name: "firecrawl_crawl",
    label: "Firecrawl Crawl",
    description: CRAWL_DESCRIPTION,
    promptSnippet: CRAWL_SNIPPET,
    promptGuidelines: CRAWL_GUIDELINES,
    parameters: Type.Object({
      url: Type.String({
        minLength: 1,
        description: "The absolute http or https starting URL.",
      }),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 100,
          description: "Maximum pages to crawl. Defaults to 20; maximum 100.",
        }),
      ),
      maxDiscoveryDepth: Type.Optional(
        Type.Integer({
          minimum: 0,
          maximum: 20,
          description: "Maximum link-discovery depth from the starting URL.",
        }),
      ),
      includePaths: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          maxItems: 50,
          description: "URL pathname regex patterns to include.",
        }),
      ),
      excludePaths: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          maxItems: 50,
          description: "URL pathname regex patterns to exclude.",
        }),
      ),
      crawlEntireDomain: Type.Optional(
        Type.Boolean({
          description: "Allow sibling and parent paths on the same domain.",
        }),
      ),
      allowSubdomains: Type.Optional(
        Type.Boolean({ description: "Allow crawling subdomains." }),
      ),
      sitemap: Type.Optional(
        StringEnum(["include", "skip", "only"] as const, {
          description: "Whether to include, skip, or exclusively use sitemap URLs.",
        }),
      ),
      onlyMainContent: Type.Optional(
        Type.Boolean({
          description: "Extract only each page's main content. Defaults to true.",
        }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 10,
          maximum: 600,
          description: "Overall crawl timeout in seconds. Defaults to 120.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      try {
        const url = params.url.trim();
        const limit = params.limit ?? 20;
        onUpdate?.({
          content: [{ type: "text", text: `Starting Firecrawl crawl of up to ${limit} pages: ${url}` }],
          details: undefined,
        });

        const client = createClient();
        const job = await client.crawl(
          {
            url,
            limit,
            maxDiscoveryDepth: params.maxDiscoveryDepth,
            includePaths: params.includePaths,
            excludePaths: params.excludePaths,
            crawlEntireDomain: params.crawlEntireDomain,
            allowSubdomains: params.allowSubdomains,
            sitemap: params.sitemap,
            onlyMainContent: params.onlyMainContent ?? true,
            timeoutMs: (params.timeoutSeconds ?? 120) * 1_000,
          },
          signal,
          (progress) => {
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `Crawling ${url}: ${progress.completed}/${progress.total || "?"} pages`,
                },
              ],
              details: undefined,
            });
          },
        );
        const formatted = await formatOutput(formatCrawl(job), "crawl", "md");

        return {
          content: [{ type: "text", text: formatted.text }],
          details: {
            jobId: job.id,
            status: job.status,
            completed: job.completed,
            total: job.total,
            creditsUsed: job.creditsUsed,
            documents: job.data.map((document) => compactMetadata(document.metadata)),
            truncated: formatted.truncated,
            fullOutputPath: formatted.fullOutputPath,
          },
        };
      } catch (error) {
        throw operationError("crawl", error);
      }
    },
  });
}
