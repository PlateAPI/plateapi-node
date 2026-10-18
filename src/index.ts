export { PlateAPI } from "./client";
export { VERSION } from "./version";
export {
  PlateAPIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  QuotaExceededError,
  NotFoundError,
  ServerError,
} from "./errors";
export type {
  Vehicle,
  LookupResult,
  MatchType,
  VehiclesResult,
  VehiclesOptions,
  VehicleType,
  CascadeItem,
  CascadeVehicle,
  VehicleRecord,
  WalkOptions,
  WalkedVehicle,
  RateLimit,
  Usage,
  HealthStatus,
  LogEntry,
  LogsResult,
  LogsOptions,
  PlateAPIOptions,
  FetchLike,
} from "./types";
