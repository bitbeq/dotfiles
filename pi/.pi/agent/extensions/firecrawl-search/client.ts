const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const ERROR_BODY_BYTES = 2 * 1024;

export const DEFAULT_FIRECRAWL_API_URL = "https://firecrawl.bitbeq.com";

export interface FirecrawlConfig {
  apiUrl: string;
  apiKey?: string;
}

export interface FirecrawlSearchOptions {
  query: string;
  limit: number;
  source: "web" | "news" | "images";
  scrapeResults: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeoutMs: number;
}

export interface FirecrawlScrapeOptions {
  url: string;
  onlyMainContent: boolean;
  waitFor?: number;
  timeoutMs: number;
}

export interface FirecrawlCrawlOptions {
  url: string;
  limit: number;
  maxDiscoveryDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  sitemap?: "include" | "skip" | "only";
  onlyMainContent: boolean;
  timeoutMs: number;
}

export interface FirecrawlDocument {
  markdown?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FirecrawlCrawlJob {
  id: string;
  status: "scraping" | "completed" | "failed" | "cancelled";
  completed: number;
  total: number;
  creditsUsed?: number;
  expiresAt?: string;
  next?: string | null;
  data: FirecrawlDocument[];
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  id?: string;
  url?: string;
  status?: FirecrawlCrawlJob["status"];
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  next?: string | null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs: number;
  retries?: number;
}

export class FirecrawlRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "FirecrawlRequestError";
    this.status = status;
  }
}

export class FirecrawlCancelledError extends Error {
  constructor() {
    super("Firecrawl request cancelled");
    this.name = "FirecrawlCancelledError";
  }
}

export class FirecrawlTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Firecrawl request timed out after ${Math.ceil(timeoutMs / 1000)} seconds`);
    this.name = "FirecrawlTimeoutError";
  }
}

function normalizeApiUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new FirecrawlRequestError(`Invalid FIRECRAWL_API_URL: ${value}`, undefined, { cause });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FirecrawlRequestError("FIRECRAWL_API_URL must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new FirecrawlRequestError(
      "FIRECRAWL_API_URL must not contain credentials, a query, or a fragment",
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

export function loadFirecrawlConfig(
  env: NodeJS.ProcessEnv = process.env,
): FirecrawlConfig {
  const apiUrl = normalizeApiUrl(
    env.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_API_URL,
  );
  const apiKey = env.FIRECRAWL_API_KEY?.trim() || undefined;
  return { apiUrl, apiKey };
}

function endpointUrl(apiUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${apiUrl}/${endpoint.replace(/^\/+/, "")}`;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new FirecrawlCancelledError());

  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new FirecrawlCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new FirecrawlRequestError(
      `Firecrawl response exceeded the ${MAX_RESPONSE_BYTES} byte safety limit`,
      response.status,
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new FirecrawlRequestError(
        `Firecrawl response exceeded the ${MAX_RESPONSE_BYTES} byte safety limit`,
        response.status,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof FirecrawlCancelledError || error instanceof FirecrawlTimeoutError) {
    return false;
  }
  if (error instanceof FirecrawlRequestError && error.status !== undefined) {
    return error.status === 429 || [502, 503, 504].includes(error.status);
  }
  return true;
}

export class FirecrawlClient {
  readonly apiUrl: string;
  readonly apiKey?: string;

  constructor(config: FirecrawlConfig = loadFirecrawlConfig()) {
    this.apiUrl = normalizeApiUrl(config.apiUrl);
    this.apiKey = config.apiKey?.trim() || undefined;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions,
  ): Promise<T> {
    const attempts = Math.max(1, (options.retries ?? 0) + 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs);
      timer.unref?.();

      try {
        const headers: Record<string, string> = {
          accept: "application/json",
        };
        if (options.body) headers["content-type"] = "application/json";
        if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

        const response = await fetch(endpointUrl(this.apiUrl, endpoint), {
          method: options.method ?? "GET",
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        const text = await readBoundedBody(response);

        let payload: unknown;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (cause) {
          throw new FirecrawlRequestError(
            `Firecrawl returned invalid JSON (HTTP ${response.status})`,
            response.status,
            { cause },
          );
        }

        const envelope = payload as ApiEnvelope<unknown>;
        if (!response.ok || envelope.success === false) {
          const detail =
            typeof envelope.error === "string"
              ? envelope.error
              : text.slice(0, ERROR_BODY_BYTES) || response.statusText;
          throw new FirecrawlRequestError(
            `Firecrawl API error (HTTP ${response.status}): ${detail}`,
            response.status,
          );
        }

        return payload as T;
      } catch (cause) {
        let error: unknown = cause;
        if (timedOut) error = new FirecrawlTimeoutError(options.timeoutMs);
        else if (options.signal?.aborted) error = new FirecrawlCancelledError();
        else if (!(cause instanceof FirecrawlRequestError)) {
          error = new FirecrawlRequestError(
            `Could not reach Firecrawl at ${this.apiUrl}: ${errorMessage(cause)}`,
            undefined,
            { cause },
          );
        }

        if (attempt >= attempts || !isRetryable(error)) throw error;
        await abortableDelay(250 * 2 ** (attempt - 1), options.signal);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }

    throw new FirecrawlRequestError("Firecrawl request failed unexpectedly");
  }

  async search(
    options: FirecrawlSearchOptions,
    signal?: AbortSignal,
  ): Promise<ApiEnvelope<Record<string, unknown>>> {
    if (options.includeDomains?.length && options.excludeDomains?.length) {
      throw new FirecrawlRequestError(
        "includeDomains and excludeDomains cannot be used together",
      );
    }

    return this.request("v2/search", {
      method: "POST",
      signal,
      timeoutMs: options.timeoutMs + 5_000,
      body: {
        query: options.query,
        limit: options.limit,
        sources: [options.source],
        includeDomains: options.includeDomains,
        excludeDomains: options.excludeDomains,
        timeout: options.timeoutMs,
        scrapeOptions: options.scrapeResults
          ? {
              formats: ["markdown"],
              onlyMainContent: true,
              timeout: options.timeoutMs,
            }
          : undefined,
      },
    });
  }

  async scrape(
    options: FirecrawlScrapeOptions,
    signal?: AbortSignal,
  ): Promise<ApiEnvelope<FirecrawlDocument>> {
    return this.request("v2/scrape", {
      method: "POST",
      signal,
      timeoutMs: options.timeoutMs + 5_000,
      body: {
        url: options.url,
        formats: ["markdown"],
        onlyMainContent: options.onlyMainContent,
        waitFor: options.waitFor,
        timeout: options.timeoutMs,
      },
    });
  }

  async crawl(
    options: FirecrawlCrawlOptions,
    signal?: AbortSignal,
    onProgress?: (job: FirecrawlCrawlJob) => void,
  ): Promise<FirecrawlCrawlJob> {
    const startedAt = Date.now();
    const started = await this.request<ApiEnvelope<never>>("v2/crawl", {
      method: "POST",
      signal,
      timeoutMs: Math.min(options.timeoutMs, 30_000),
      body: {
        url: options.url,
        limit: options.limit,
        maxDiscoveryDepth: options.maxDiscoveryDepth,
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
        crawlEntireDomain: options.crawlEntireDomain,
        allowSubdomains: options.allowSubdomains,
        sitemap: options.sitemap,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: options.onlyMainContent,
          timeout: Math.min(options.timeoutMs, 120_000),
        },
      },
    });

    if (!started.id) {
      throw new FirecrawlRequestError("Firecrawl did not return a crawl job ID");
    }
    const jobId = started.id;
    let terminal = false;

    try {
      while (true) {
        const remaining = options.timeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) throw new FirecrawlTimeoutError(options.timeoutMs);

        const raw = await this.request<ApiEnvelope<FirecrawlDocument[]>>(
          `v2/crawl/${encodeURIComponent(jobId)}`,
          {
            signal,
            timeoutMs: Math.min(remaining, 15_000),
            retries: 2,
          },
        );
        const job = this.toCrawlJob(jobId, raw);
        onProgress?.(job);

        if (job.status === "completed") {
          terminal = true;
          return await this.collectCrawlPages(job, options.limit, remaining, signal);
        }
        if (job.status === "failed") {
          terminal = true;
          throw new FirecrawlRequestError(`Firecrawl crawl ${jobId} failed`);
        }
        if (job.status === "cancelled") {
          terminal = true;
          throw new FirecrawlCancelledError();
        }

        await abortableDelay(Math.min(2_000, remaining), signal);
      }
    } catch (error) {
      if (!terminal) await this.cancelCrawlQuietly(jobId);
      throw error;
    }
  }

  private toCrawlJob(
    id: string,
    raw: ApiEnvelope<FirecrawlDocument[]>,
  ): FirecrawlCrawlJob {
    if (!raw.status) {
      throw new FirecrawlRequestError(`Firecrawl crawl ${id} returned no status`);
    }
    return {
      id,
      status: raw.status,
      completed: raw.completed ?? 0,
      total: raw.total ?? 0,
      creditsUsed: raw.creditsUsed,
      expiresAt: raw.expiresAt,
      next: raw.next,
      data: Array.isArray(raw.data) ? raw.data : [],
    };
  }

  private async collectCrawlPages(
    first: FirecrawlCrawlJob,
    limit: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<FirecrawlCrawlJob> {
    const documents = [...first.data];
    let next = first.next;
    let pageCount = 0;
    const startedAt = Date.now();

    while (next && documents.length < limit) {
      pageCount += 1;
      if (pageCount > 20) {
        throw new FirecrawlRequestError("Firecrawl crawl pagination exceeded 20 pages");
      }
      const nextUrl = this.validateCrawlNextUrl(first.id, next);
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) throw new FirecrawlTimeoutError(timeoutMs);

      const raw = await this.request<ApiEnvelope<FirecrawlDocument[]>>(nextUrl, {
        signal,
        timeoutMs: Math.min(remaining, 15_000),
        retries: 2,
      });
      documents.push(...(Array.isArray(raw.data) ? raw.data : []));
      next = raw.next;
    }

    return {
      ...first,
      completed: Math.max(first.completed, documents.length),
      next: next ?? null,
      data: documents.slice(0, limit),
    };
  }

  private validateCrawlNextUrl(jobId: string, next: string): string {
    const base = new URL(`${this.apiUrl}/`);
    const parsed = new URL(next, base);
    const expectedPath = `${base.pathname.replace(/\/$/, "")}/v2/crawl/${encodeURIComponent(jobId)}`;
    if (parsed.origin !== base.origin || parsed.pathname !== expectedPath) {
      throw new FirecrawlRequestError("Firecrawl returned an unsafe crawl pagination URL");
    }
    return parsed.toString();
  }

  private async cancelCrawlQuietly(jobId: string): Promise<void> {
    try {
      await this.request(`v2/crawl/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        timeoutMs: 10_000,
      });
    } catch {
      // Preserve the original interruption or crawl error.
    }
  }
}
