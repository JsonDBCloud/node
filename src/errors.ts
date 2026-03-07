/** Base error class for all jsondb.cloud API errors */
export class JsonDBError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "JsonDBError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends JsonDBError {
  public readonly documentId?: string;
  constructor(message: string, documentId?: string) {
    super(message, "DOCUMENT_NOT_FOUND", 404);
    this.name = "NotFoundError";
    this.documentId = documentId;
  }
}

export class ConflictError extends JsonDBError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class ValidationError extends JsonDBError {
  public readonly errors: { path: string; message: string; keyword: string }[];
  constructor(message: string, errors: { path: string; message: string; keyword: string }[] = []) {
    super(message, "VALIDATION_FAILED", 400, { errors });
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export class UnauthorizedError extends JsonDBError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends JsonDBError {
  constructor(message: string = "Forbidden") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class QuotaExceededError extends JsonDBError {
  constructor(message: string) {
    super(message, "QUOTA_EXCEEDED", 429);
    this.name = "QuotaExceededError";
  }
}

export class RateLimitError extends JsonDBError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMITED", 429);
    this.name = "RateLimitError";
  }
}

export class DocumentTooLargeError extends JsonDBError {
  constructor(message: string) {
    super(message, "DOCUMENT_TOO_LARGE", 413);
    this.name = "DocumentTooLargeError";
  }
}

export class ServerError extends JsonDBError {
  constructor(message: string = "Internal server error") {
    super(message, "INTERNAL_ERROR", 500);
    this.name = "ServerError";
  }
}

/** Convert an API error response into the appropriate error class */
export function createError(status: number, body: { error?: { code?: string; message?: string; details?: Record<string, unknown> } }): JsonDBError {
  const code = body.error?.code || "UNKNOWN";
  const message = body.error?.message || "Unknown error";
  const details = body.error?.details || {};

  switch (status) {
    case 401: return new UnauthorizedError(message);
    case 403: return new ForbiddenError(message);
    case 404: return new NotFoundError(message);
    case 409: return new ConflictError(message);
    case 413: return new DocumentTooLargeError(message);
    case 429:
      if (code === "RATE_LIMITED") return new RateLimitError(message);
      return new QuotaExceededError(message);
    case 400:
      if (code === "VALIDATION_FAILED") {
        return new ValidationError(message, (details.errors || []) as { path: string; message: string; keyword: string }[]);
      }
      return new JsonDBError(message, code, 400, details);
    default:
      if (status >= 500) return new ServerError(message);
      return new JsonDBError(message, code, status, details);
  }
}
