# PlateAPI Node.js SDK

TypeScript/JavaScript SDK for [PlateAPI](https://plateapi.com.au) -- Australian vehicle registration plate lookup.

## Install

```bash
npm install plateapi
```

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

## Detailed lookup

```typescript
const result = await client.lookup("ABC123", "NSW", { detailed: true });
if (result.success) {
  console.log(result.vehicle.detailed_description);
  console.log(result.vehicle.engine);
  console.log(result.vehicle.body);
}
```

## Check usage

```typescript
const usage = await client.usage();
console.log(`${usage.used}/${usage.limit} lookups used`);
console.log(`${usage.remaining} remaining`);
console.log(`Plan: ${usage.plan}`);
```

## Vehicle database

```typescript
const makes = await client.vehicles();
const models = await client.vehicles({ make: "TOYOTA" });
const years = await client.vehicles({ make: "TOYOTA", model: "HILUX" });
```

## Health check

```typescript
const health = await client.health();
console.log(health.status);
```

## Rate limits

Rate limit info is returned with every lookup:

```typescript
const result = await client.lookup("ABC123", "VIC");
console.log(result.rate_limit.remaining);
console.log(result.rate_limit.plan);
```

## Error handling

```typescript
import {
  PlateAPI,
  AuthenticationError,
  RateLimitError,
  QuotaExceededError,
} from "plateapi";

const client = new PlateAPI("pk_live_your_api_key");

try {
  const result = await client.lookup("ABC123", "VIC");
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.log("Invalid API key");
  } else if (err instanceof QuotaExceededError) {
    console.log("Monthly quota exceeded");
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${err.retry_after}s`);
  }
}
```

## Retry behaviour

The SDK automatically retries on:
- Connection errors
- Timeouts
- 429 rate limit responses (waits for Retry-After)
- 5xx server errors

Default: 3 retries with exponential backoff and jitter. Configure with:

```typescript
const client = new PlateAPI("pk_live_your_api_key", {
  max_retries: 5,
  timeout: 60000,
});
```

## Sandbox

Use plate `TEST123` with any state for testing. No quota consumed.

```typescript
const result = await client.lookup("TEST123", "VIC");
console.log(result.sandbox); // true
```

## Links

- [API Documentation](https://plateapi.com.au/docs)
- [Dashboard](https://plateapi.com.au/dashboard)
- [Sign up for free](https://plateapi.com.au/register)
