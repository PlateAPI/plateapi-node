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
}

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  plan: string | null;
}

export interface LookupResult {
  success: boolean;
  vehicle: Vehicle | null;
  alternatives: Vehicle[];
  source: string | null;
  duration_ms: number | null;
  sandbox: boolean;
  code?: string | null;
  error?: string | null;
  request_id: string | null;
  rate_limit: RateLimit;
}

export interface VehiclesResult {
  success: boolean;
  type: string | null;
  data: string[];
  total: number;
  duration_ms: number | null;
}

export interface VehiclesOptions {
  make?: string;
  model?: string;
  year?: number;
  series?: string;
  engine?: string;
  variant?: string;
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

export interface PlateAPIOptions {
  base_url?: string;
  timeout?: number;
  max_retries?: number;
}
