import {
  PlateAPIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  QuotaExceededError,
  ServerError,
} from "./errors";
import type {
  CascadeItem,
  CascadeVehicle,
  FetchLike,
  HealthStatus,
  LogEntry,
  LogsOptions,
  LogsResult,
  LookupResult,
  MatchType,
  PlateAPIOptions,
  RateLimit,
  Usage,
  Vehicle,
  VehicleRecord,
  VehiclesOptions,
  VehiclesResult,
  WalkOptions,
  WalkedVehicle,
} from "./types";
import { VERSION } from "./version";
import { walkVehicles } from "./walker";

export const VALID_STATES = new Set([
  "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT",
]);
export const VALID_VEHICLE_TYPES = new Set(["car", "motorcycle"]);
export const DEFAULT_BASE_URL = "https://api.plateapi.com.au";
export const DEFAULT_TIMEOUT = 30000;
export const MAX_RETRIES = 3;
export const DEFAULT_MAX_WAIT = 60000;
export const USER_AGENT = `plateapi-node/${VERSION}`;
const INITIAL_BACKOFF = 1000;

type JsonObject = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw === "unlimited") return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseRateLimit(headers: Headers): RateLimit {
  return {
    limit: headerInt(headers, "x-ratelimit-limit"),
    remaining: headerInt(headers, "x-ratelimit-remaining"),
    plan: headers.get("x-ratelimit-plan"),
    topup_remaining: headerInt(headers, "x-topup-remaining"),
  };
}

function parseVehicle(data: unknown): Vehicle | null {
  if (!data || typeof data !== "object") return null;
  const d = data as JsonObject;
  return {
    make: str(d.make),
    model: str(d.model),
    year: num(d.lowest_year),
    year_range: str(d.year_range),
    lowest_year: num(d.lowest_year),
    highest_year: num(d.highest_year),
    body: str(d.body),
    engine: str(d.engine),
    series: str(d.series),
    description: str(d.description),
    detailed_description: str(d.detailed_description),
    vehicle_id: num(d.vehicle_id),
  };
}

function candidateIds(vehicle: Vehicle | null, alternatives: Vehicle[]): number[] {
  const ids: number[] = [];
  for (const v of [vehicle, ...alternatives]) {
    if (v && v.vehicle_id !== null && !ids.includes(v.vehicle_id)) ids.push(v.vehicle_id);
  }
  return ids;
}

function parseCascadeVehicle(item: JsonObject): CascadeVehicle {
  return {
    ...item,
    vehicle_id: num(item.vehicle_id),
    select_text: str(item.select_text),
    description: str(item.description),
    long_description: str(item.long_description),
  };
}

function parseRecord(data: unknown): VehicleRecord {
  const d = (data && typeof data === "object" ? data : {}) as JsonObject;
  const years = Array.isArray(d.years) ? d.years.filter((y): y is number => typeof y === "number") : [];
  return {
    vehicle_id: num(d.vehicle_id),
    vehicle_type: str(d.vehicle_type),
    make: str(d.make),
    model: str(d.model),
    year_range: str(d.year_range),
    lowest_year: num(d.lowest_year),
    highest_year: num(d.highest_year),
    years,
    description: str(d.description),
    long_description: str(d.long_description),
    series: str(d.series),
    engine: str(d.engine),
    variant: str(d.variant),
    body: str(d.body),
    body_size: str(d.body_size),
    doors: num(d.doors),
    drive: str(d.drive),
    transmission: str(d.transmission),
    detail: str(d.detail),
    raw: d,
  };
}

function backoffDelay(attempt: number): number {
  return INITIAL_BACKOFF * 2 ** attempt + Math.random() * 500;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = parseFloat(value);
  if (Number.isNaN(seconds) || seconds < 0) return undefined;
  return seconds;
}

async function safeJson(response: Response): Promise<JsonObject | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as JsonObject) : null;
  } catch {
    return null;
  }
}

function errorMessage(body: JsonObject | null, status: number): string {
  if (body) {
    for (const key of ["detail", "error"]) {
      const value = body[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return `Request failed (HTTP ${status})`;
}

function requestIdOf(body: JsonObject | null, response: Response): string | undefined {
  if (body && typeof body.request_id === "string") return body.request_id;
  return response.headers.get("x-request-id") ?? undefined;
}

function isQuotaExceeded(body: JsonObject | null): boolean {
  if (!body) return false;
  if (body.code === "quota_exceeded") return true;
  const detail = body.detail;
  return typeof detail === "string" && detail.toLowerCase().startsWith("monthly quota exceeded");
}

export class PlateAPI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private maxWait: number | null;
  private fetchImpl: FetchLike;

  constructor(apiKey: string, options: PlateAPIOptions = {}) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("apiKey must be a non-empty string");
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.base_url ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.max_retries ?? MAX_RETRIES;
    this.maxWait = options.max_wait === undefined ? DEFAULT_MAX_WAIT : options.max_wait;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  }

  /** Pause for `ms` milliseconds. Overridable (tests record waits instead of sleeping). */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private canWait(ms: number): boolean {
    return this.maxWait === null || ms <= this.maxWait;
  }

  private async request(
    method: string,
    path: string,
    params?: Record<string, string>,
    includeAuth = true,
    maxRetries?: number,
  ): Promise<Response> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const search = new URLSearchParams(params);
      url += `?${search.toString()}`;
    }
    const retries = maxRetries ?? this.maxRetries;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        };
        if (includeAuth) headers["X-API-Key"] = this.apiKey;
        response = await this.fetchImpl(url, { method, headers, signal: controller.signal });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        const isTimeout = name === "AbortError" || name === "TimeoutError";
        if (attempt < retries) {
          await this.sleep(backoffDelay(attempt));
          continue;
        }
        throw new PlateAPIError(
          isTimeout ? "Request timed out" : `Connection failed: ${(err as Error)?.message ?? err}`,
        );
      } finally {
        clearTimeout(timer);
      }

      const status = response.status;
      if (status < 400) return response;

      const body = await safeJson(response);
      const message = errorMessage(body, status);
      const code = body && typeof body.code === "string" ? body.code : undefined;
      const requestId = requestIdOf(body, response);
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

      if (status === 429) {
        if (isQuotaExceeded(body)) {
          throw new QuotaExceededError(message, retryAfter, requestId);
        }
        const wait = retryAfter !== undefined ? retryAfter * 1000 : backoffDelay(attempt);
        if (attempt < retries && this.canWait(wait)) {
          await this.sleep(wait);
          continue;
        }
        throw new RateLimitError(message, retryAfter, requestId, code);
      }

      if (status >= 500) {
        const wait = retryAfter !== undefined ? retryAfter * 1000 : backoffDelay(attempt);
        if (attempt < retries && this.canWait(wait)) {
          await this.sleep(wait);
          continue;
        }
        throw new ServerError(message, status, retryAfter, code, requestId);
      }

      if (status === 400) throw new BadRequestError(message, requestId, code);
      if (status === 401) throw new AuthenticationError(message, requestId, code);
      if (status === 403) throw new PermissionDeniedError(message, requestId, code);
      if (status === 404) throw new NotFoundError(message, requestId, code ?? "not_found");
      throw new PlateAPIError(message, status, code, requestId);
    }
  }

  // ---- lookups ----

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

    let response: Response;
    let body: JsonObject;
    for (let attempt = 0; ; attempt++) {
      response = await this.request("GET", "/api/v1/lookup", params);
      body = ((await response.json()) ?? {}) as JsonObject;
      // internal_error is a 200 that is not billed; one more try usually succeeds.
      if (body.success === false && body.code === "internal_error" && attempt < this.maxRetries) {
        await this.sleep(backoffDelay(attempt));
        continue;
      }
      break;
    }

    const vehicle = parseVehicle(body.vehicle);
    const altsRaw = Array.isArray(body.alternatives) ? body.alternatives : [];
    const alternatives = altsRaw.map(parseVehicle).filter((v): v is Vehicle => v !== null);

    return {
      success: body.success === true,
      vehicle,
      alternatives,
      match: (str(body.match) as MatchType | null),
      candidate_ids: candidateIds(vehicle, alternatives),
      source: str(body.source),
      duration_ms: num(body.duration_ms),
      sandbox: body.sandbox === true,
      code: str(body.code),
      error: str(body.error),
      request_id: str(body.request_id) ?? response.headers.get("x-request-id"),
      rate_limit: parseRateLimit(response.headers),
    };
  }

  // ---- vehicle database ----

  async vehicles(options: VehiclesOptions = {}): Promise<VehiclesResult> {
    if (options.vehicle_type !== undefined && !VALID_VEHICLE_TYPES.has(options.vehicle_type)) {
      throw new Error(
        `Invalid vehicle_type '${options.vehicle_type}'. Must be one of: ${[...VALID_VEHICLE_TYPES].sort().join(", ")}`,
      );
    }
    const params: Record<string, string> = {};
    if (options.vehicle_type !== undefined) params.type = options.vehicle_type;
    if (options.make !== undefined) params.make = options.make;
    if (options.model !== undefined) params.model = options.model;
    if (options.year !== undefined) params.year = String(options.year);
    if (options.series !== undefined) params.series = options.series;
    if (options.engine !== undefined) params.engine = options.engine;
    if (options.variant !== undefined) params.variant = options.variant;

    const response = await this.request("GET", "/api/v1/vehicles", params);
    const body = ((await response.json()) ?? {}) as JsonObject;
    const dataList = Array.isArray(body.data) ? body.data : [];
    const first = (dataList.length > 0 && dataList[0] && typeof dataList[0] === "object"
      ? dataList[0]
      : {}) as JsonObject;
    const rawItems: unknown[] = Array.isArray(first.data) ? first.data : [];
    const data: CascadeItem[] = [];
    const vehicles: CascadeVehicle[] = [];
    for (const item of rawItems) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = parseCascadeVehicle(item as JsonObject);
        data.push(record);
        vehicles.push(record);
      } else if (typeof item === "string" || typeof item === "number") {
        data.push(item);
      } else {
        data.push(String(item));
      }
    }
    return {
      success: body.success === true,
      type: str(first.type),
      data,
      vehicles,
      vehicle_ids: vehicles
        .map((v) => v.vehicle_id)
        .filter((id): id is number => id !== null),
      total: num(body.total) ?? 0,
      duration_ms: num(body.duration_ms),
    };
  }

  async vehicleById(vehicleId: number | string): Promise<VehicleRecord> {
    let id: number;
    if (typeof vehicleId === "string" && /^\d+$/.test(vehicleId)) {
      id = parseInt(vehicleId, 10);
    } else if (typeof vehicleId === "number" && Number.isInteger(vehicleId) && vehicleId >= 0) {
      id = vehicleId;
    } else {
      throw new Error("vehicle_id must be a non-negative integer");
    }
    const response = await this.request("GET", `/api/v1/vehicles/${id}`);
    const body = ((await response.json()) ?? {}) as JsonObject;
    return parseRecord(body.vehicle);
  }

  walkVehicles(
    make: string,
    model: string,
    options: WalkOptions = {},
  ): AsyncGenerator<WalkedVehicle, void, undefined> {
    return walkVehicles(
      { vehicles: (o) => this.vehicles(o), sleep: (ms) => this.sleep(ms) },
      make,
      model,
      options,
    );
  }

  // ---- account ----

  async usage(): Promise<Usage> {
    const response = await this.request("GET", "/api/v1/keys/usage");
    const body = ((await response.json()) ?? {}) as JsonObject;
    return {
      email: str(body.email),
      plan: str(body.plan),
      monthly_limit: num(body.monthly_limit) ?? 0,
      used_this_month: num(body.used_this_month) ?? 0,
      remaining: num(body.remaining) ?? 0,
      percent_used: num(body.percent_used),
      rate_limit_per_min: num(body.rate_limit_per_min) ?? 0,
      last_lookup_at: str(body.last_lookup_at),
      period_start: str(body.period_start),
      period_end: str(body.period_end),
      days_remaining: num(body.days_remaining),
      cancel_at_period_end: body.cancel_at_period_end === true,
      cancel_at: str(body.cancel_at),
      topup_credits: num(body.topup_credits) ?? 0,
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
    const body = ((await response.json()) ?? {}) as JsonObject;
    const rawLogs = Array.isArray(body.logs) ? body.logs : [];

    const logs: LogEntry[] = rawLogs.map((raw) => {
      const entry = (raw && typeof raw === "object" ? raw : {}) as JsonObject;
      return {
        plate: str(entry.plate),
        state: str(entry.state),
        success: num(entry.success) ?? 0,
        error: str(entry.error),
        duration_ms: num(entry.duration_ms),
        make: str(entry.make),
        model: str(entry.model),
        year: num(entry.year),
        client_ip: str(entry.client_ip),
        request_id: str(entry.request_id),
        created_at: str(entry.created_at),
      };
    });

    return {
      logs,
      count: num(body.count) ?? 0,
      total: num(body.total) ?? 0,
      limit: num(body.limit) ?? (options.limit ?? 100),
      offset: num(body.offset) ?? (options.offset ?? 0),
    };
  }

  async health(): Promise<HealthStatus> {
    const response = await this.request("GET", "/api/v1/health", undefined, false, 0);
    const body = ((await response.json()) ?? {}) as JsonObject;
    return {
      status: str(body.status) ?? "unknown",
      version: str(body.version),
    };
  }
}
