export class PlateAPIError extends Error {
  status_code?: number;
  /** The API's machine code when it sent one (not_found, lookup_failed, unavailable, quota_exceeded). */
  code?: string;
  /** The request ID from the body or the X-Request-ID header. Quote it when contacting support. */
  request_id?: string;

  constructor(message: string, status_code?: number, code?: string, request_id?: string) {
    super(message);
    this.name = "PlateAPIError";
    this.status_code = status_code;
    this.code = code;
    this.request_id = request_id;
  }
}

/** HTTP 400: invalid plate, state, cascade value or vehicle ID. */
export class BadRequestError extends PlateAPIError {
  constructor(message = "Bad request", request_id?: string, code?: string) {
    super(message, 400, code, request_id);
    this.name = "BadRequestError";
  }
}

/** HTTP 401: missing, invalid or deactivated API key, or email not verified. */
export class AuthenticationError extends PlateAPIError {
  constructor(message = "Invalid API key", request_id?: string, code?: string) {
    super(message, 401, code, request_id);
    this.name = "AuthenticationError";
  }
}

/** HTTP 403: IP not on the key's allowlist, account banned, or the vehicle database needs Starter or above. */
export class PermissionDeniedError extends PlateAPIError {
  constructor(message = "Permission denied", request_id?: string, code?: string) {
    super(message, 403, code, request_id);
    this.name = "PermissionDeniedError";
  }
}

/** HTTP 404: no vehicle with that vehicle_id. */
export class NotFoundError extends PlateAPIError {
  constructor(message = "Not found", request_id?: string, code = "not_found") {
    super(message, 404, code, request_id);
    this.name = "NotFoundError";
  }
}

/** HTTP 429. retry_after is the server's Retry-After in seconds, if sent. */
export class RateLimitError extends PlateAPIError {
  retry_after?: number;

  constructor(message = "Rate limit exceeded", retry_after?: number, request_id?: string, code?: string) {
    super(message, 429, code, request_id);
    this.name = "RateLimitError";
    this.retry_after = retry_after;
  }
}

/** HTTP 429 because the monthly lookup quota is used up. Also a RateLimitError. */
export class QuotaExceededError extends RateLimitError {
  constructor(message = "Monthly quota exceeded", retry_after?: number, request_id?: string) {
    super(message, retry_after, request_id, "quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

/** HTTP 5xx after retries. code is lookup_failed or unavailable when the API sent one. */
export class ServerError extends PlateAPIError {
  retry_after?: number;

  constructor(message: string, status_code: number, retry_after?: number, code?: string, request_id?: string) {
    super(message, status_code, code, request_id);
    this.name = "ServerError";
    this.retry_after = retry_after;
  }
}
