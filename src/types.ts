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
  rate_limit: RateLimit;
}

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
  plan: string | null;
  period_start: string | null;
  period_end: string | null;
  topup_credits: number;
}

export interface HealthStatus {
  status: string;
  version: string | null;
}

export interface PlateAPIOptions {
  base_url?: string;
  timeout?: number;
  max_retries?: number;
}
