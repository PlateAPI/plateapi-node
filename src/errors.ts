export class PlateAPIError extends Error {
  status_code?: number;
  code?: string;

  constructor(message: string, status_code?: number, code?: string) {
    super(message);
    this.name = "PlateAPIError";
    this.status_code = status_code;
    this.code = code;
  }
}

export class AuthenticationError extends PlateAPIError {
  constructor(message = "Invalid API key") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends PlateAPIError {
  retry_after?: number;

  constructor(message = "Rate limit exceeded", retry_after?: number) {
    super(message, 429);
    this.name = "RateLimitError";
    this.retry_after = retry_after;
  }
}

export class QuotaExceededError extends PlateAPIError {
  constructor(message = "Monthly quota exceeded") {
    super(message, 429, "quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

export class NotFoundError extends PlateAPIError {
  constructor(message = "Plate not found") {
    super(message, 404, "not_found");
    this.name = "NotFoundError";
  }
}

export class ServerError extends PlateAPIError {
  retry_after?: number;

  constructor(message: string, status_code: number, retry_after?: number) {
    super(message, status_code);
    this.name = "ServerError";
    this.retry_after = retry_after;
  }
}
