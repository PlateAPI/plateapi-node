# Changelog

## 0.2.0 -- 2026-10-18

Every 0.1.0 program keeps working. New fields and methods only; see "Upgrading from 0.1.0"
in the README for the few behaviour changes.

### Added

- `Vehicle.vehicle_id`: PlateAPI's stable ID for the exact variant, on the primary vehicle and
  on every entry in `alternatives`.
- `LookupResult.match` (`exact`, `multiple`, `ambiguous`) and `LookupResult.candidate_ids`.
- `PlateAPI.vehicleById(vehicleId)` -> `VehicleRecord` for `GET /api/v1/vehicles/{vehicle_id}`.
- `PlateAPI.vehicles({ vehicle_type: "motorcycle" })` for the motorcycle cascade.
- `VehiclesResult.vehicles` and `VehiclesResult.vehicle_ids` for the last cascade level.
- `PlateAPI.walkVehicles(make, model, options)`: async generator that walks the cascade for one
  make and model (and its trims) and yields each `vehicle_id` once, with `year_from` / `year_to`,
  `engine_contains`, `per_year`, `known_ids` (resume) and `delay` options.
- `RateLimit.topup_remaining` from the `X-Topup-Remaining` header.
- `BadRequestError` (400) and `PermissionDeniedError` (403). `NotFoundError` is now thrown for 404.
- `request_id` and `code` on every `PlateAPIError`, from the body or the `X-Request-ID` header.
- `max_wait` client option: the longest `Retry-After` the SDK will sleep (default 60 s).
- `fetch` client option for a custom fetch implementation.
- `User-Agent: plateapi-node/<version>` and the exported `VERSION`.
- Test suite (`npm test`, no network).

### Fixed

- A monthly-quota 429 throws `QuotaExceededError` at once instead of sleeping for an hour and
  retrying.
- A `Retry-After` longer than `max_wait` throws instead of sleeping.
- `health()` makes a single attempt.
- Error messages are the API's own (`detail` / `error`), not a fixed string.
- A lookup that returns `code: "internal_error"` (not billed) is retried before it is returned.
- `VehiclesResult.data` is typed as what the API returns (strings, numbers at the year level,
  records at the vehicle level).

### Changed

- `QuotaExceededError` now extends `RateLimitError` (still a `PlateAPIError`).
- An empty API key is rejected by the constructor.

## 0.1.0 -- 2026-08-16

- First release: `lookup`, `vehicles`, `usage`, `logs`, `health`, retries with backoff.
