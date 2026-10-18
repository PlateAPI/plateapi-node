# PlateAPI Node.js SDK

TypeScript/JavaScript SDK for [PlateAPI](https://plateapi.com.au) -- Australian vehicle
registration plate lookup and the PlateAPI vehicle database.

## Install

```bash
npm install plateapi-sdk
```

Requires Node.js 18+ (uses the global `fetch`). No runtime dependencies. Full TypeScript type
definitions included.

## Quick start

```typescript
import { PlateAPI } from "plateapi-sdk";

const client = new PlateAPI("pk_live_your_api_key");

const result = await client.lookup("ABC123", "VIC");
if (result.success && result.vehicle) {
  console.log(result.vehicle.make, result.vehicle.model, result.vehicle.year_range);
  console.log(result.vehicle.vehicle_id);   // PlateAPI's stable ID for this variant
  console.log(result.match);                // "exact", "multiple" or "ambiguous"
}
```

### CommonJS

```javascript
const { PlateAPI } = require("plateapi-sdk");

const client = new PlateAPI("pk_live_your_api_key");
```

Get a free API key (20 lookups a month, no card) at [plateapi.com.au/register](https://plateapi.com.au/register/).
Full API reference: [plateapi.com.au/docs](https://plateapi.com.au/docs/).

## Plate lookup

```typescript
const result = await client.lookup("ABC123", "VIC");

result.success                    // true when a vehicle was found
result.match                      // "exact" | "multiple" | "ambiguous" (null when not found)
result.vehicle?.make              // "TOYOTA"
result.vehicle?.model             // "HILUX"
result.vehicle?.year_range        // "2015-2020" ("2020-ON" for models still in production)
result.vehicle?.lowest_year       // 2015
result.vehicle?.highest_year      // 2020 (null for an open range)
result.vehicle?.year              // same as lowest_year
result.vehicle?.body              // "UTE" (may be null)
result.vehicle?.engine            // "2.8L" (may be null)
result.vehicle?.description       // "15~20 TOYOTA HILUX 2.8L DIESEL"
result.vehicle?.vehicle_id        // 1380801 (null when the variant is not certain)
result.alternatives               // other candidate variants, same fields, each with its own vehicle_id
result.candidate_ids              // every non-null vehicle_id, primary first: [1380801]
result.request_id                 // "req_7f3a9c1b4e8d2f6a0c5e" -- quote this when contacting support
result.duration_ms                // 1509.96
result.sandbox                    // true only for the TEST123 sandbox plate
```

Valid states: `NSW`, `VIC`, `QLD`, `SA`, `WA`, `TAS`, `NT`, `ACT`. Plate and state are
upper-cased and trimmed for you; an unknown state throws an `Error` before any request.

### Not found

A plate that does not resolve is a normal result, not an exception. It is still HTTP 200 and it
still counts against your monthly quota (typos are common, so validate input first).

```typescript
const result = await client.lookup("ZZZ999", "NSW");
if (!result.success) {
  console.log(result.code);    // "not_found"
  console.log(result.error);   // human-readable message
}
```

### `vehicle_id` and `match`

Every vehicle in a lookup carries `vehicle_id`: PlateAPI's ID for the exact variant. It is stable
(the same variant always returns the same ID) and it is the same ID the vehicle database uses, so
you can link your own records (products, SKUs, fitment rows) to it. It is `null` when the variant
could not be identified with certainty; an ID is never guessed.

`match` tells you how to read the result:

| `match` | Meaning | What to store |
|---------|---------|---------------|
| `exact` | one variant | `result.vehicle.vehicle_id` |
| `multiple` | several trims of one make and model, all on sale at the same time; `vehicle` is the first with its ID, the rest are in `alternatives` | all of `result.candidate_ids`, or let the customer pick |
| `ambiguous` | candidates are different makes or models, or different generations; `vehicle.vehicle_id` is `null` and `alternatives` lists every candidate (including the one shown as `vehicle`) with its ID | `result.candidate_ids` (a picker is best) |

```typescript
const result = await client.lookup("ABC123", "VIC");
if (result.match === "exact") {
  save(result.vehicle!.vehicle_id);
} else {
  for (const alt of result.alternatives) {
    console.log(alt.vehicle_id, alt.description, alt.year_range);
  }
  saveAll(result.candidate_ids);
}
```

With `match: "multiple"` the primary `vehicle_id` identifies the first candidate, not necessarily
the plate's own trim. Lookup text (`make`, `model`, `description`) can be worded differently from
the record the ID points to: integrate on `vehicle_id`, not on text.

### Detailed lookup

```typescript
const result = await client.lookup("ABC123", "NSW", { detailed: true });
console.log(result.vehicle?.detailed_description);
// "TOYOTA HILUX SR Auto or Manual AN120 AN130 05/2015~12/2020 4 Door UTE 4x4 DIESEL 2.8 litre, ..."
```

`detailed_description` may be `null` for some vehicles even when requested.

### Rate limit headers

Each lookup result carries the quota headers from the response:

```typescript
result.rate_limit.limit            // monthly lookup allowance
result.rate_limit.remaining        // lookups left this period
result.rate_limit.plan             // "starter"
result.rate_limit.topup_remaining  // remaining top-up credits, only while they are being consumed
```

## Vehicle database

Starter plans and above. The database holds 23,000+ Australian-market car variants (225+ makes)
and 15,000+ motorcycles, scooters and ATVs (420+ makes). Queries do not consume lookup quota; they
have their own limit of 500 requests per minute.

### Cascade

`vehicles()` returns one level of the seven-level cascade. Each call narrows it: no arguments gives
the makes, `make` gives models, and so on down to full vehicle records with a `vehicle_id`.

```typescript
let r = await client.vehicles();                                   // r.type === "make"
r.data.slice(0, 3);                                                // ["ABARTH", "ACE EV", "ACURA"]

r = await client.vehicles({ make: "TOYOTA" });                     // "model"
r = await client.vehicles({ make: "TOYOTA", model: "HILUX" });     // "year"  (newest first, numbers)
r = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2019 });                    // "series"
r = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2019,
                            series: "GUN126R -GUN126" });                                      // "engine"
r = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2019,
                            series: "GUN126R -GUN126",
                            engine: "2.8L,  DIE 1GDFTV I4 16v DOHC I/C Turbo CRD {130kW}" });  // "variant"
r = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2019,
                            series: "GUN126R -GUN126",
                            engine: "2.8L,  DIE 1GDFTV I4 16v DOHC I/C Turbo CRD {130kW}",
                            variant: "4D Ute -, 4WD MR0HA3CD  [THAILAND], AT/MT" });          // "vehicle"
r.vehicles        // [{ vehicle_id: 1346446, select_text: "...", description: "...", long_description: "..." }]
r.vehicle_ids     // [1346446]
```

`VehiclesResult` fields: `success`, `type` (the level returned), `data` (strings, numbers at the
year level, or records at the vehicle level), `vehicles` and `vehicle_ids` (filled at the vehicle
level), `total`, `duration_ms`.

Rules worth knowing:

- Pass each value exactly as the previous level returned it. Values contain commas, double spaces,
  braces and brackets, and matching is case-sensitive. The SDK URL-encodes them for you.
- An empty-string series is a real value. Pass `series: ""` to continue below it.
- Unknown values are not errors: you get `success === true` with an empty `data` array. A `503`
  (database briefly unavailable) is retried by the SDK and then thrown as `ServerError`.
- Trims are filed as separate models (`HILUX`, `HILUX SR`, `HILUX SR5 EXTRA CAB`), so to cover a
  base model walk every model name that starts with it. `walkVehicles()` below does this.
- The vehicle level is a list: a few paths return two records whose catalogue entries overlap in
  that year. Use each record's description and `vehicleById()` to tell them apart.
- `vehicle_id` identifies the variant, not the year: a variant returns the same ID under every
  model year it was sold.

### Motorcycles

Motorcycles have their own cascade. Pass `vehicle_type: "motorcycle"` on every level
(`"car"` is the default).

```typescript
r = await client.vehicles({ vehicle_type: "motorcycle" });                          // 420+ makes
r = await client.vehicles({ make: "YAMAHA", model: "MT-07", vehicle_type: "motorcycle" });
```

A motorcycle plate lookup returns the same ID as the motorcycle cascade. Any other `vehicle_type`
throws before any request.

### One vehicle by ID

```typescript
const record = await client.vehicleById(1380801);   // also accepts "1380801"

record.vehicle_id        // 1380801
record.vehicle_type      // "car" or "motorcycle"
record.make              // "TOYOTA"
record.model             // "HILUX SR"
record.year_range        // "2015-2020"
record.lowest_year       // 2015
record.highest_year      // 2020 (null for an open range)
record.years             // [2015, 2016, 2017, 2018, 2019, 2020]
record.description       // "15~20 TOYOTA HILUX 2.8L DIESEL"
record.long_description  // "TOYOTA HILUX 10/2015~04/2020"
record.series            // "GUN126R -GUN126"
record.engine            // "2.8L,  DIE 1GDFTV I4 16v DOHC I/C Turbo CRD {130kW}"
record.variant           // "SR,  4D Ute -, 4WD MR0KA3CD  [THAILAND], AT/MT"
record.body              // "UTE"
record.body_size         // "COMPACT" / "MEDIUM" / "FULL-SIZE" for SUVs, else null
record.doors             // 4
record.drive             // "4WD", "AWD", "RWD", "FWD", "6X4", ...
record.transmission      // "AT", "MT", "AT/MT", "CVT", "DCT", "AMT"
record.detail            // "full" or "basic"
record.raw               // the vehicle object exactly as returned
```

- `detail === "basic"` means the vehicle has an ID but its full record has not been added yet:
  `series`, `variant` and `long_description` are `null` and `years` is empty. The ID does not
  change when the full record is added.
- `body`, `body_size`, `doors`, `drive` and `transmission` are read from the variant name and are
  `null` when it does not carry them.
- A retired ID that was merged into another returns the current record, so `record.vehicle_id` can
  differ from the ID you asked for. Compare them if you care.
- An unknown ID throws `NotFoundError` (code `not_found`). Anything that is not a non-negative
  integer or a string of digits throws before any request.
- The sandbox plate `TEST123` returns `vehicle_id` 1380801, a real record, so you can test this
  call without using quota.

## Walking the cascade

`walkVehicles()` collects every `vehicle_id` for one make and model: it walks models, years,
series, engines, variants and vehicles for you and yields each vehicle the first time it is seen.
This is how you map existing fitment text (make, model, years, engine) to PlateAPI IDs once.

```typescript
for await (const v of client.walkVehicles("TOYOTA", "HILUX", { year_from: 2015, year_to: 2020, engine_contains: "2.8L" })) {
  console.log(v.vehicle_id, v.model, v.year, v.series, v.engine, v.variant);
}
```

| Option | Default | Meaning |
|--------|---------|---------|
| `make`, `model` (arguments) | required | base model; must be non-empty |
| `trims` | `true` | also walk every model name starting with `model + " "` (`HILUX SR`, `HILUX SR5 EXTRA CAB`). `false` walks `model` only and skips the models request |
| `year_from`, `year_to` | none | inclusive model-year window; throws if from > to |
| `engine_contains` | none | only engines whose name contains this text (case-insensitive), e.g. `"2.8L"` or `"DIE"` |
| `vehicle_type` | none | `"motorcycle"` for the motorcycle cascade |
| `per_year` | `false` | yield one row per vehicle per model year instead of one row per vehicle (for year-level master lists) |
| `known_ids` | none | a `Set` of IDs already handled; they are not yielded again and the set is updated in place (resume an interrupted walk). With `per_year` the keys are `"id:year"` strings |
| `delay` | `150` | milliseconds to pause after each request; the default stays under 500 requests/minute |

Each `WalkedVehicle` has `vehicle_id`, `make`, `model` (the exact model name it was found under),
`year`, `series`, `engine`, `variant` (the cascade's `select_text`), `description`,
`long_description`, `vehicle_type` and `raw` (the vehicle record). The path fields are where the
vehicle was first seen; with `per_year: true` you get a row for every year.

The walk is an async generator, so results arrive as they are found and you can `break` at any
time. Errors are thrown at the point they happen; everything already yielded stays with you. A
`429` whose `Retry-After` is longer than `max_wait` (60 s by default) throws `RateLimitError`
immediately rather than sleeping, so a long walk never sits silently. Catch it, save your progress
and resume later with `known_ids`.

A Hilux walk (all trims, all years) is about 350 requests and takes a minute or two at the default
delay; a single make and model with a year window is usually a few seconds.

### Example: stream IDs to a CSV, resumable

```typescript
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { PlateAPI, RateLimitError } from "plateapi-sdk";

const FILENAME = "hilux.csv";
const FIELDS = ["vehicle_id", "make", "model", "year", "series", "engine", "variant", "description"] as const;

const known = new Set<number | string>();
if (existsSync(FILENAME)) {
  for (const line of readFileSync(FILENAME, "utf8").split("\n").slice(1)) {
    if (line) known.add(Number(line.split(",")[0]));
  }
}

const client = new PlateAPI(process.env.PLATEAPI_KEY!);
const out = createWriteStream(FILENAME, { flags: "a" });
if (known.size === 0) out.write(FIELDS.join(",") + "\n");

try {
  for await (const v of client.walkVehicles("TOYOTA", "HILUX", { known_ids: known })) {
    out.write(FIELDS.map((k) => JSON.stringify(v[k] ?? "")).join(",") + "\n");
  }
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`rate limited, retry in ${err.retry_after} s; ${known.size} rows saved`);
  } else {
    throw err;
  }
} finally {
  out.end();
}
```

Run it again later and it continues where it stopped.

### Linking products (SKUs) to vehicles

Keep a many-to-many table `(sku, vehicle_id)`. Walk the cascade once per fitment line to fill it,
then on each plate lookup query the table by `result.vehicle.vehicle_id` (or every ID in
`result.candidate_ids` when `match` is `multiple`). Store IDs, not text. The full guide is at
[plateapi.com.au/docs/vehicles](https://plateapi.com.au/docs/vehicles/#vehicles-skus).

## Account

### Usage

```typescript
const usage = await client.usage();
usage.plan               // "starter"
usage.monthly_limit      // 600
usage.used_this_month    // 12
usage.remaining          // 588
usage.percent_used       // 2.0
usage.rate_limit_per_min // 10
usage.period_start       // "2026-09-07 00:00:00" (UTC)
usage.period_end         // null when there is no billing period (free plan)
usage.days_remaining     // null when there is no billing period
usage.last_lookup_at     // "2026-10-03 03:20:02"
usage.topup_credits      // remaining purchased top-up lookups
usage.cancel_at_period_end, usage.cancel_at
```

### Lookup history

```typescript
const logs = await client.logs({ limit: 50, offset: 0, since: "2026-10-01T00:00:00" });
for (const entry of logs.logs) {
  console.log(entry.created_at, entry.plate, entry.state, entry.success, entry.duration_ms, entry.request_id);
}
console.log(logs.count, "of", logs.total);
```

`limit` is at most 500. `since` / `until` are ISO 8601 UTC. `success: true` / `false` filters
found / not found. `LogEntry` fields: `plate`, `state`, `success` (1 or 0), `error`,
`duration_ms`, `make`, `model`, `year`, `client_ip`, `request_id`, `created_at`.

### Health

```typescript
(await client.health()).status   // "ok"
```

No key is sent, no quota is used, and the call makes a single attempt.

## Sandbox

Plate `TEST123` with any state returns a fixed vehicle instantly: free, no quota, no rate limit.
A valid key is still required. Use it in integration tests and CI.

```typescript
const result = await client.lookup("TEST123", "VIC");
result.sandbox                 // true
result.vehicle?.vehicle_id     // 1380801
(await client.vehicleById(result.vehicle!.vehicle_id!)).model   // "HILUX SR"
```

## Errors

All errors extend `PlateAPIError` and carry `status_code`, `code` (the API's machine code when it
sent one) and `request_id`. Messages are the API's own.

| Class | HTTP | When |
|-------|------|------|
| `BadRequestError` | 400 | invalid plate, state, cascade parameter or vehicle ID |
| `AuthenticationError` | 401 | missing, invalid or deactivated key; email not verified |
| `PermissionDeniedError` | 403 | IP not on the key's allowlist, account banned, or vehicle database on a Free / Lite plan |
| `NotFoundError` | 404 | `vehicleById()` with an unknown ID |
| `RateLimitError` | 429 | per-minute limit; `retry_after` in seconds |
| `QuotaExceededError` | 429 | monthly quota used up (extends `RateLimitError`; `retry_after` is 3600) |
| `ServerError` | 5xx | after retries; `code` is `lookup_failed` or `unavailable` when the API sent one, `retry_after` when it sent a header |
| `PlateAPIError` | other | connection failures, timeouts, unexpected statuses |

```typescript
import {
  PlateAPI, PlateAPIError, AuthenticationError, PermissionDeniedError,
  RateLimitError, QuotaExceededError, NotFoundError, ServerError,
} from "plateapi-sdk";

try {
  const result = await client.lookup("ABC123", "VIC");
} catch (err) {
  if (err instanceof QuotaExceededError) {
    console.log("monthly quota used up:", err.message);
  } else if (err instanceof RateLimitError) {
    console.log("slow down, retry in", err.retry_after, "seconds");
  } else if (err instanceof AuthenticationError) {
    console.log("key problem:", err.message);
  } else if (err instanceof ServerError) {
    console.log("temporary failure, not billed:", err.code, err.request_id);
  } else if (err instanceof PlateAPIError) {
    console.log("error", err.status_code, err.message);
  } else {
    throw err;
  }
}
```

A lookup that cannot be completed (`503`, code `lookup_failed`) is never billed; retry it after a
few seconds. A `200` with `code: "internal_error"` is also not billed and is retried by the SDK
before it is returned.

## Retries and waiting

| Response | Behaviour |
|----------|-----------|
| connection error, timeout | retried up to `max_retries` with backoff (1 s, 2 s, 4 s plus jitter), then `PlateAPIError` |
| 400 / 401 / 403 / 404 | thrown at once, no retry |
| 429 monthly quota | `QuotaExceededError` at once, no sleep |
| 429 other | sleeps `Retry-After` (backoff if absent) and retries; if `Retry-After` is longer than `max_wait` or retries are used up, `RateLimitError` |
| 5xx | same rule, then `ServerError` |
| 200 lookup with `internal_error` | retried with backoff, then returned |

```typescript
const client = new PlateAPI("pk_live_your_api_key", {
  base_url: "https://api.plateapi.com.au",  // default
  timeout: 30000,        // milliseconds per request
  max_retries: 3,        // retries after the first attempt
  max_wait: 60000,       // longest Retry-After to sleep, in milliseconds; null waits any length
  fetch: undefined,      // a custom fetch (for example one that goes through a proxy)
});
```

Every request sends `User-Agent: plateapi-node/<version>`.

## TypeScript types

All types are exported for use in your own code:

```typescript
import type {
  Vehicle, LookupResult, MatchType, VehiclesResult, VehiclesOptions, VehicleType,
  CascadeItem, CascadeVehicle, VehicleRecord, WalkOptions, WalkedVehicle,
  RateLimit, Usage, HealthStatus, LogEntry, LogsResult, LogsOptions, PlateAPIOptions,
} from "plateapi-sdk";
```

## Upgrading from 0.1.0

Everything written against 0.1.0 keeps working: no public name, method, option, field or error
class was removed. New in 0.2.0: `vehicle_id`, `match`, `candidate_ids`, `vehicleById()`,
`walkVehicles()`, `vehicle_type: "motorcycle"`, `vehicles` / `vehicle_ids` on cascade results,
`topup_remaining`, `BadRequestError`, `PermissionDeniedError`, `request_id` and `code` on errors,
`max_wait`, custom `fetch`.

Behaviour changes to be aware of:

- A monthly-quota `429` now throws `QuotaExceededError` immediately. 0.1.0 only recognised a body
  code the API does not send, so it slept for an hour and retried. `QuotaExceededError` now extends
  `RateLimitError`, so `instanceof RateLimitError` catches both, as it effectively did before.
- A `Retry-After` longer than `max_wait` (60 s) throws instead of sleeping. Pass `max_wait: null`
  for the old behaviour.
- `health()` makes one attempt.
- Error messages are the API's `detail` / `error` text instead of fixed strings.
- 400, 403 and 404 throw `BadRequestError`, `PermissionDeniedError` and `NotFoundError` (all
  extend `PlateAPIError`, which 0.1.0 threw).
- `VehiclesResult.data` is now typed as `Array<string | number | CascadeVehicle>`: 0.1.0 declared
  `string[]` but already returned numbers at the year level and objects at the vehicle level.

See [CHANGELOG.md](CHANGELOG.md).

## Links

- [API documentation](https://plateapi.com.au/docs/)
- [Vehicle database and vehicle IDs](https://plateapi.com.au/docs/vehicles/)
- [OpenAPI spec](https://plateapi.com.au/openapi.json)
- [Pricing](https://plateapi.com.au/pricing/)
- [Dashboard](https://plateapi.com.au/dashboard/)
- [Status page](https://plateapi.com.au/status/)
- [Support](mailto:support@plateapi.com.au)
