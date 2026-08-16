export { PlateAPI } from "./client";
export {
  PlateAPIError,
  AuthenticationError,
  RateLimitError,
  QuotaExceededError,
  NotFoundError,
  ServerError,
} from "./errors";
export type {
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
} from "./types";
