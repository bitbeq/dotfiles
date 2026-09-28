import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import {
  FirecrawlCancelledError,
  FirecrawlClient,
  loadFirecrawlConfig,
} from "./client.ts";

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ success: false, error: String(error) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    }),
  };
}

test("uses the homelab URL by default and accepts environment overrides", () => {
  assert.equal(loadFirecrawlConfig({}).apiUrl, "https://firecrawl.bitbeq.com");
  assert.deepEqual(
    loadFirecrawlConfig({
      FIRECRAWL_API_URL: "http://firecrawl.local:3002/",
      FIRECRAWL_API_KEY: " secret ",
    }),
    { apiUrl: "http://firecrawl.local:3002", apiKey: "secret" },
  );
});

test("search sends v2 options without an authorization header when no key is configured", async () => {
  let body: Record<string, unknown> | undefined;
  let authorization: string | undefined;
  const server = await withServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v2/search");
    authorization = request.headers.authorization;
    body = await readJson(request);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { web: [{ url: "https://example.com" }] } }));
  });

  try {
    const client = new FirecrawlClient({ apiUrl: server.url });
    const result = await client.search({
      query: "example",
      limit: 3,
      source: "web",
      scrapeResults: false,
      timeoutMs: 5_000,
    });
    assert.equal(authorization, undefined);
    assert.equal(body?.query, "example");
    assert.deepEqual(body?.sources, ["web"]);
    assert.deepEqual(result.data, { web: [{ url: "https://example.com" }] });
  } finally {
    await server.close();
  }
});

test("cancels a remote crawl when the tool signal is aborted", async () => {
  let pollingStarted!: () => void;
  const polling = new Promise<void>((resolve) => {
    pollingStarted = resolve;
  });
  const cancelledJobs: string[] = [];

  const server = await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/v2/crawl") {
      await readJson(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, id: "crawl-123", url: "https://example.com" }));
      return;
    }
    if (request.method === "GET" && request.url === "/v2/crawl/crawl-123") {
      pollingStarted();
      return;
    }
    if (request.method === "DELETE" && request.url === "/v2/crawl/crawl-123") {
      cancelledJobs.push("crawl-123");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: "cancelled" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ success: false, error: "not found" }));
  });

  try {
    const client = new FirecrawlClient({ apiUrl: server.url });
    const controller = new AbortController();
    const running = client.crawl(
      {
        url: "https://example.com",
        limit: 1,
        onlyMainContent: true,
        timeoutMs: 30_000,
      },
      controller.signal,
    );

    await polling;
    controller.abort();
    await assert.rejects(running, FirecrawlCancelledError);
    assert.deepEqual(cancelledJobs, ["crawl-123"]);
  } finally {
    await server.close();
  }
});
