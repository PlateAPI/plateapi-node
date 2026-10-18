export interface Vehicle {
  make: string | null;
  model: string | null;
  year: number | null;
  year_range: string | null;
  lowest_year: number | null;
  highest_year: number | null;
  body: string | null;
  engine: string | null;
  series?: string | null;
  description: string | null;
  detailed_description?: string | null;
  /** PlateAPI's stable ID for this exact variant. null when the variant is not certain. */
  vehicle_id: number | null;
}

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  plan: string | null;
  /** Remaining top-up credits, only while they are being consumed. */
  topup_remaining: number | null;
}

export type MatchType = "exact" | "multiple" | "ambiguous";

export interface LookupResult {
  success: boolean;
  vehicle: Vehicle | null;
  alternatives: Vehicle[];
  /** "exact", "multiple" or "ambiguous"; null when not found. */
  match: MatchType | null;
  /** Every non-null vehicle_id, primary first then alternatives, no duplicates. */
  candidate_ids: number[];
  source: string | null;
  duration_ms: number | null;
  sandbox: boolean;
  code?: string | null;
  error?: string | null;
  request_id: string | null;
  rate_limit: RateLimit;
}

/** One record at the vehicle level of the cascade. */
export interface CascadeVehicle {
  vehicle_id: number | null;
  select_text: string | null;
  description: string | null;
  long_description: string | null;
  [key: string]: unknown;
}

/** A cascade value: a string at most levels, a number at the year level, a record at the vehicle level. */
export type CascadeItem = string | number | CascadeVehicle;

export interface VehiclesResult {
  success: boolean;
  type: string | null;
  data: CascadeItem[];
  /** Parsed records at the vehicle level; empty at other levels. */
  vehicles: CascadeVehicle[];
  /** vehicle_id of each record at the vehicle level; empty at other levels. */
  vehicle_ids: number[];
  total: number;
  duration_ms: number | null;
}

export type VehicleType = "car" | "motorcycle";

export interface VehiclesOptions {
  make?: string;
  model?: string;
  year?: number;
  series?: string;
  engine?: string;
  variant?: string;
  /** "car" (default) or "motorcycle". */
  vehicle_type?: VehicleType;
}

export interface VehicleRecord {
  vehicle_id: number | null;
  vehicle_type: string | null;
  make: string | null;
  model: string | null;
  year_range: string | null;
  lowest_year: number | null;
  highest_year: number | null;
  years: number[];
  description: string | null;
  long_description: string | null;
  series: string | null;
  engine: string | null;
  variant: string | null;
  body: string | null;
  body_size: string | null;
  doors: number | null;
  drive: string | null;
  transmission: string | null;
  /** "full" or "basic". */
  detail: string | null;
  /** The vehicle object exactly as returned. */
  raw: Record<string, unknown>;
}

export interface WalkOptions {
  /** Also walk every model name starting with `model + " "`. Default true. */
  trims?: boolean;
  year_from?: number;
  year_to?: number;
  /** Only engines whose name contains this text (case-insensitive). */
  engine_contains?: string;
  vehicle_type?: VehicleType;
  /** One result per vehicle per model year instead of one per vehicle. */
  per_year?: boolean;
  /** IDs already handled (or "id:year" strings with per_year); updated in place. */
  known_ids?: Set<number | string>;
  /** Milliseconds to pause after each request. Default 150. */
  delay?: number;
}

export interface WalkedVehicle {
  vehicle_id: number;
  make: string;
  model: string;
  year: number;
  series: string;
  engine: string;
  variant: string;
  description: string | null;
  long_description: string | null;
  vehicle_type: VehicleType;
  raw: CascadeVehicle;
}

export interface Usage {
  email: string | null;
  plan: string | null;
  monthly_limit: number;
  used_this_month: number;
  remaining: number;
  percent_used: number | null;
  rate_limit_per_min: number;
  last_lookup_at: string | null;
  period_start: string | null;
  period_end: string | null;
  days_remaining: number | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  topup_credits: number;
}

export interface HealthStatus {
  status: string;
  version: string | null;
}

export interface LogEntry {
  plate: string | null;
  state: string | null;
  success: number;
  error: string | null;
  duration_ms: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
  client_ip: string | null;
  request_id: string | null;
  created_at: string | null;
}

export interface LogsResult {
  logs: LogEntry[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface LogsOptions {
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  plate?: string;
  success?: boolean;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PlateAPIOptions {
  base_url?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Retries after the first attempt. Default 3. */
  max_retries?: number;
  /** Longest Retry-After the SDK will sleep, in milliseconds. Default 60000; null waits any length. */
  max_wait?: number | null;
  /** Custom fetch implementation (proxies, tests). Defaults to the global fetch. */
  fetch?: FetchLike;
}
