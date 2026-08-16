# PlateAPI Node.js SDK

TypeScript/JavaScript SDK for [PlateAPI](https://plateapi.com.au) -- Australian vehicle registration plate lookup.

## Install

```bash
npm install plateapi
```

Requires Node.js 18+. Full TypeScript type definitions included.

## Quick start

```typescript
import { PlateAPI } from "plateapi";

const client = new PlateAPI("pk_live_your_api_key");

const result = await client.lookup("ABC123", "VIC");
if (result.success) {
  console.log(result.vehicle.make);
  console.log(result.vehicle.model);
  console.log(result.vehicle.year);
}
```

### CommonJS

```javascript
const { PlateAPI } = require("plateapi");

const client = new PlateAPI("pk_live_your_api_key");
```

## Plate lookup

```typescript
const result = await client.lookup("ABC123", "VIC");

console.log(result.success);                // true if a vehicle was found
console.log(result.vehicle?.make);           // "TOYOTA"
console.log(result.vehicle?.model);          // "HILUX"
console.log(result.vehicle?.year);           // 2015
console.log(result.vehicle?.year_range);     // "2015 - 2023"
console.log(result.vehicle?.lowest_year);    // 2015
console.log(result.vehicle?.highest_year);   // 2023
console.log(result.vehicle?.body);           // "UTILITY"
console.log(result.vehicle?.engine);         // "2.8L"
console.log(result.vehicle?.description);    // "TOYOTA HILUX UTILITY 2.8L"
console.log(result.duration_ms);             // 2451.3
console.log(result.source);                  // data source identifier
console.log(result.request_id);              // "req_7f3a9c1b4e..." (include when contacting support)
```

Valid states: `NSW`, `VIC`, `QLD`, `SA`, `WA`, `TAS`, `NT`, `ACT`.

## Detailed lookup

Pass `detailed: true` to get extended vehicle descriptions when available.

```typescript
const result = await client.lookup("ABC123", "NSW", { detailed: true });
if (result.success) {
  console.log(result.vehicle?.detailed_description);
  console.log(result.vehicle?.series);
}
```

## Multiple matches

Some plates match more than one vehicle record. The best match is in `result.vehicle`, and any alternatives are in `result.alternatives`.

```typescript
const result = await client.lookup("ABC123", "VIC");
if (result.alternatives.length > 0) {
  for (const alt of result.alternatives) {
    console.log(`  Also matched: ${alt.make} ${alt.model} (${alt.year_range})`);
  }
}
```

## Vehicle database

Browse the full vehicle database (32,000+ vehicles, 213 makes). Each call narrows the cascade -- call with no arguments to get all makes, then pass `make` to get models, and so on through all 7 levels. Paid plans only, no quota consumed.

Returns a `VehiclesResult` with `success`, `type` (the cascade level), `data` (array of values), `total`, and `duration_ms`.

```typescript
// Step 1: All makes
const makes = await client.vehicles();
console.log(makes.type);     // "make"
console.log(makes.data.slice(0, 5)); // ["ABARTH", "AC", "ALFA ROMEO", ...]
console.log(makes.total);    // 213

// Step 2: Models for a make
const models = await client.vehicles({ make: "TOYOTA" });
console.log(models.type);    // "model"
console.log(models.data.slice(0, 5)); // ["86", "ALPHARD", "AURION", ...]

// Step 3: Years for a make + model
const years = await client.vehicles({ make: "TOYOTA", model: "HILUX" });
console.log(years.type);     // "year"
console.log(years.data.slice(0, 5)); // [2025, 2024, 2023, ...]

// Step 4: Series for a make + model + year
const series = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2020 });
console.log(series.type);    // "series"
console.log(series.data);    // ["SR", "SR5", "Rogue", "Rugged", ...]

// Step 5: Engines for a make + model + year + series
const engines = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2020, series: "SR5" });
console.log(engines.type);   // "engine"
console.log(engines.data);   // ["2.8L", "2.4L", ...]

// Step 6: Variants for a make + model + year + series + engine
const variants = await client.vehicles({
  make: "TOYOTA", model: "HILUX", year: 2020, series: "SR5", engine: "2.8L",
});
console.log(variants.type);  // "variant"
console.log(variants.data);  // ["4x4 Double Cab", "4x4 Extra Cab", ...]

// Step 7: Full vehicle details
const vehicles = await client.vehicles({
  make: "TOYOTA", model: "HILUX", year: 2020, series: "SR5",
  engine: "2.8L", variant: "4x4 Double Cab",
});
console.log(vehicles.type);  // "vehicle"
console.log(vehicles.data);  // [{make: "TOYOTA", model: "HILUX", ...}]
```

For vehicles without a series code, pass an empty string:

```typescript
const result = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2020, series: "" });
```

## Check usage

```typescript
const usage = await client.usage();
console.log(`${usage.used_this_month}/${usage.monthly_limit} lookups used`);
console.log(`${usage.remaining} remaining`);
console.log(`${usage.percent_used}% used`);
console.log(`Plan: ${usage.plan}`);
console.log(`Rate limit: ${usage.rate_limit_per_min}/min`);
console.log(`Period: ${usage.period_start} to ${usage.period_end}`);
console.log(`Days remaining: ${usage.days_remaining}`);
console.log(`Last lookup: ${usage.last_lookup_at}`);
console.log(`Top-up credits: ${usage.topup_credits}`);
console.log(`Cancel at period end: ${usage.cancel_at_period_end}`);
console.log(`Cancel at: ${usage.cancel_at}`);
```

## Request logs

Retrieve your lookup history with optional filtering and pagination. Useful for auditing, debugging, and building analytics.

```typescript
// Last 10 lookups
const logs = await client.logs({ limit: 10 });
for (const entry of logs.logs) {
  const status = entry.success ? "found" : "not found";
  console.log(`${entry.created_at} | ${entry.plate} (${entry.state}) | ${status} | ${entry.duration_ms}ms`);
}

console.log(`Showing ${logs.count} of ${logs.total} total`);
```

### Filtering

```typescript
// Filter by plate
const plateLogs = await client.logs({ plate: "ABC123" });

// Only failed lookups
const failed = await client.logs({ success: false });

// Time range (ISO 8601, UTC)
const julyLogs = await client.logs({
  since: "2026-07-01T00:00:00",
  until: "2026-07-31T23:59:59",
});

// Pagination
const page1 = await client.logs({ limit: 50, offset: 0 });
const page2 = await client.logs({ limit: 50, offset: 50 });
```

### Log entry fields

Each `LogEntry` contains: `plate`, `state`, `success` (1 or 0), `error`, `duration_ms`, `make`, `model`, `year`, `client_ip`, `request_id`, `created_at`.

## Health check

Check API availability. No authentication required, no quota consumed.

```typescript
const health = await client.health();
console.log(health.status); // "ok"
```

## Rate limits

Rate limit info is included with every lookup response.

```typescript
const result = await client.lookup("ABC123", "VIC");
console.log(result.rate_limit.limit);      // monthly lookup allowance
console.log(result.rate_limit.remaining);   // lookups left this period
console.log(result.rate_limit.plan);        // current plan slug

// Warn before quota runs out
if (result.rate_limit.remaining !== null && result.rate_limit.remaining < 50) {
  console.warn(`Warning: only ${result.rate_limit.remaining} lookups remaining`);
}
```

## Error handling

```typescript
import {
  PlateAPI,
  PlateAPIError,
  AuthenticationError,
  RateLimitError,
  QuotaExceededError,
  ServerError,
} from "plateapi";

const client = new PlateAPI("pk_live_your_api_key");

try {
  const result = await client.lookup("ABC123", "VIC");
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.log("Invalid API key");
  } else if (err instanceof QuotaExceededError) {
    console.log("Monthly quota exceeded -- upgrade at plateapi.com.au");
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${err.retry_after}s`);
  } else if (err instanceof ServerError) {
    console.log(`Server error (${err.status_code}), retry after ${err.retry_after}s`);
  } else if (err instanceof PlateAPIError) {
    console.log(`API error: ${err.message} (status ${err.status_code})`);
  }
}
```

## Retry behaviour

The SDK automatically retries on:
- Connection errors
- Timeouts
- 429 rate limit responses (waits for Retry-After header)
- 5xx server errors

Default: 3 retries with exponential backoff and jitter. Configure with:

```typescript
const client = new PlateAPI("pk_live_your_api_key", {
  max_retries: 5,
  timeout: 60000,
});
```

## Sandbox

Use plate `TEST123` with any state for testing. Returns a fixed response instantly, no quota consumed.

```typescript
const result = await client.lookup("TEST123", "VIC");
console.log(result.sandbox);        // true
console.log(result.success);        // true
console.log(result.vehicle?.make);   // "TOYOTA"
```

The sandbox also supports `detailed: true`.

## Configuration

```typescript
const client = new PlateAPI("pk_live_your_api_key", {
  base_url: "https://api.plateapi.com.au", // default
  timeout: 30000,                           // milliseconds, default 30000
  max_retries: 3,                           // default 3
});
```

## TypeScript types

All types are exported for use in your own code:

```typescript
import type {
  Vehicle,
  LookupResult,
  VehiclesResult,
  VehiclesOptions,
  RateLimit,
  Usage,
  HealthStatus,
  LogEntry,
  LogsResult,
  LogsOptions,
  PlateAPIOptions,
} from "plateapi";
```

## Links

- [API Documentation](https://plateapi.com.au/docs)
- [Pricing](https://plateapi.com.au/pricing)
- [Dashboard](https://plateapi.com.au/dashboard)
- [Sign up for free](https://plateapi.com.au/register)
- [Status page](https://plateapi.com.au/status)
- [GitHub](https://github.com/PlateAPI)
