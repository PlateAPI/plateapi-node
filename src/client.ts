import {
  PlateAPIError,
  AuthenticationError,
  RateLimitError,
  QuotaExceededError,
  ServerError,
} from "./errors";
import type {
  Vehicle,
  RateLimit,
  LookupResult,
  Usage,
  HealthStatus,
  LogEntry,
  LogsResult,
  LogsOptions,
  PlateAPIOptions,
} from "./types";

const VALID_STATES = new Set([
  "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT",
]);
const DEFAULT_BASE_URL = "https://api.plateapi.com.au";
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

function parseRateLimit(headers: Headers): RateLimit {
  const rawLimit = headers.get("x-ratelimit-limit");
  const rawRemaining = headers.get("x-ratelimit-remaining");
  return {
    limit:
      rawLimit && rawLimit !== "unlimited" ? parseInt(rawLimit, 10) : null,
    remaining:
      rawRemaining && rawRemaining !== "unlimited"
        ? parseInt(rawRemaining, 10)
        : null,
    plan: headers.get("x-ratelimit-plan"),
  };
}

function parseVehicle(data: Record<string, unknown> | null): Vehicle | null {
  if (!data) return null;
  return {
    make: (data.make as string) ?? null,
    model: (data.model as string) ?? null,
    year: (data.lowest_year as number) ?? null,
    year_range: (data.year_range as string) ?? null,
    lowest_year: (data.lowest_year as number) ?? null,
    highest_year: (data.highest_year as number) ?? null,
    body: (data.body as string) ?? null,
    engine: (data.engine as string) ?? null,
    series: (data.series as string) ?? null,
    description: (data.description as string) ?? null,
    detailed_description: (data.detailed_description as string) ?? null,
  };
}

function backoffDelay(attempt: number): number {
  return INITIAL_BACKOFF * 2 ** attempt + Math.random() * 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlateAPI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(apiKey: string, options: PlateAPIOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.base_url ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.max_retries ?? MAX_RETRIES;
  }

  private async request(
    method: string,
    path: string,
    params?: Record<string, string>,
    includeAuth = true,
  ): Promise<Response> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const search = new URLSearchParams(params);
      url += `?${search.toString()}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (includeAuth) headers["X-API-Key"] = this.apiKey;
        response = await fetch(url, {
          method,
          headers,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const isTimeout =
          err instanceof DOMException && err.name === "AbortError";
        lastError = new PlateAPIError(
          isTimeout ? "Request timed out" : `Connection failed: ${err}`,
        );
        if (attempt < this.maxRetries) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401) {
        throw new AuthenticationError();
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        let body: Record<string, unknown> = {};
        try {
          body = (await response.json()) as Record<string, unknown>;
        } catch {}
        if (body.code === "quota_exceeded") {
          throw new QuotaExceededError();
        }
        if (attempt < this.maxRetries) {
          const wait = retryAfter
            ? parseFloat(retryAfter) * 1000
            : backoffDelay(attempt);
          await sleep(wait);
          continue;
        }
        throw new RateLimitError(
          "Rate limit exceeded",
          retryAfter ? parseFloat(retryAfter) : undefined,
        );
      }

      if (response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");
        if (attempt < this.maxRetries) {
          const wait = retryAfter
            ? parseFloat(retryAfter) * 1000
            : backoffDelay(attempt);
          await sleep(wait);
          continue;
        }
        throw new ServerError(
          `Server error (${response.status})`,
          response.status,
          retryAfter ? parseFloat(retryAfter) : undefined,
        );
      }

      if (response.status >= 400) {
        let message = "Request failed";
        try {
          const body = (await response.json()) as Record<string, unknown>;
          message =
            (body.detail as string) ?? (body.error as string) ?? message;
        } catch {}
        throw new PlateAPIError(message, response.status);
      }

      return response;
    }

    throw lastError ?? new PlateAPIError("Request failed after retries");
  }

  async lookup(
    plate: string,
    state: string,
    options: { detailed?: boolean } = {},
  ): Promise<LookupResult> {
    state = state.toUpperCase().trim();
    plate = plate.toUpperCase().trim();

    if (!VALID_STATES.has(state)) {
      throw new Error(
        `Invalid state '${state}'. Must be one of: ${[...VALID_STATES].sort().join(", ")}`,
      );
    }
    if (!plate) {
      throw new Error("Plate cannot be empty");
    }

    const params: Record<string, string> = { plate, state };
    if (options.detailed) params.detailed = "true";

    const response = await this.request("GET", "/api/v1/lookup", params);
    const body = (await response.json()) as Record<string, unknown>;
    const rateLimit = parseRateLimit(response.headers);

    const altsRaw = (body.alternatives as Record<string, unknown>[]) ?? [];

    return {
      success: (body.success as boolean) ?? false,
      vehicle: parseVehicle(body.vehicle as Record<string, unknown> | null),
      alternatives: altsRaw.map(parseVehicle).filter(Boolean) as Vehicle[],
      source: (body.source as string) ?? null,
      duration_ms: (body.duration_ms as number) ?? null,
      sandbox: (body.sandbox as boolean) ?? false,
      code: (body.code as string) ?? null,
      error: (body.error as string) ?? null,
      request_id: (body.request_id as string) ?? null,
      rate_limit: rateLimit,
    };
  }

  async vehicles(options: {
    make?: string;
    model?: string;
    year?: number;
    series?: string;
    engine?: string;
  } = {}): Promise<string[]> {
    const params: Record<string, string> = {};
    if (options.make) params.make = options.make;
    if (options.model) params.model = options.model;
    if (options.year) params.year = String(options.year);
    if (options.series) params.series = options.series;
    if (options.engine) params.engine = options.engine;

    const response = await this.request("GET", "/api/v1/vehicles", params);
    return (await response.json()) as string[];
  }

  async usage(): Promise<Usage> {
    const response = await this.request("GET", "/api/v1/keys/usage");
    const body = (await response.json()) as Record<string, unknown>;
    return {
      used: (body.used as number) ?? 0,
      limit: (body.limit as number) ?? 0,
      remaining: (body.remaining as number) ?? 0,
      plan: (body.plan as string) ?? null,
      period_start: (body.period_start as string) ?? null,
      period_end: (body.period_end as string) ?? null,
      topup_credits: (body.topup_credits as number) ?? 0,
    };
  }

  async logs(options: LogsOptions = {}): Promise<LogsResult> {
    const params: Record<string, string> = {
      limit: String(options.limit ?? 100),
      offset: String(options.offset ?? 0),
    };
    if (options.since) params.since = options.since;
    if (options.until) params.until = options.until;
    if (options.plate) params.plate = options.plate;
    if (options.success !== undefined) params.success = String(options.success);

    const response = await this.request("GET", "/api/v1/keys/logs", params);
    const body = (await response.json()) as Record<string, unknown>;
    const rawLogs = (body.logs as Record<string, unknown>[]) ?? [];

    return {
      logs: rawLogs.map((entry) => ({
        plate: (entry.plate as string) ?? null,
        state: (entry.state as string) ?? null,
        success: (entry.success as number) ?? 0,
        error: (entry.error as string) ?? null,
        duration_ms: (entry.duration_ms as number) ?? null,
        make: (entry.make as string) ?? null,
        model: (entry.model as string) ?? null,
        year: (entry.year as number) ?? null,
        client_ip: (entry.client_ip as string) ?? null,
        request_id: (entry.request_id as string) ?? null,
        created_at: (entry.created_at as string) ?? null,
      })),
      count: (body.count as number) ?? 0,
      total: (body.total as number) ?? 0,
      limit: (body.limit as number) ?? 100,
      offset: (body.offset as number) ?? 0,
    };
  }

  async health(): Promise<HealthStatus> {
    const response = await this.request(
      "GET",
      "/api/v1/health",
      undefined,
      false,
    );
    const body = (await response.json()) as Record<string, unknown>;
    return {
      status: (body.status as string) ?? "unknown",
      version: (body.version as string) ?? null,
    };
  }
}
