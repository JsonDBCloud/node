import { describe, it, expect } from "vitest";
import {
  createError,
  JsonDBError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  QuotaExceededError,
  RateLimitError,
  DocumentTooLargeError,
  ServerError,
} from "./errors";

describe("createError", () => {
  it("returns UnauthorizedError for 401", () => {
    const err = createError(401, { error: { message: "Bad token" } });
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Bad token");
  });

  it("returns ForbiddenError for 403", () => {
    const err = createError(403, { error: { message: "No access" } });
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("returns NotFoundError for 404", () => {
    const err = createError(404, {
      error: { message: "Doc not found" },
    });
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("returns ConflictError for 409", () => {
    const err = createError(409, { error: { message: "Version conflict" } });
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.status).toBe(409);
  });

  it("returns DocumentTooLargeError for 413", () => {
    const err = createError(413, { error: { message: "Too big" } });
    expect(err).toBeInstanceOf(DocumentTooLargeError);
    expect(err.status).toBe(413);
  });

  it("returns RateLimitError for 429 with RATE_LIMITED code", () => {
    const err = createError(429, {
      error: { code: "RATE_LIMITED", message: "Slow down" },
    });
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("returns QuotaExceededError for 429 without RATE_LIMITED code", () => {
    const err = createError(429, {
      error: { code: "QUOTA_EXCEEDED", message: "Over limit" },
    });
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.status).toBe(429);
  });

  it("returns ValidationError for 400 with VALIDATION_FAILED code", () => {
    const validationErrors = [
      { path: "/name", message: "Required", keyword: "required" },
    ];
    const err = createError(400, {
      error: {
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: { errors: validationErrors },
      },
    });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.status).toBe(400);
    expect((err as ValidationError).errors).toEqual(validationErrors);
  });

  it("returns generic JsonDBError for 400 with unknown code", () => {
    const err = createError(400, {
      error: { code: "BAD_REQUEST", message: "Invalid input" },
    });
    expect(err).toBeInstanceOf(JsonDBError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("returns ServerError for 500", () => {
    const err = createError(500, { error: { message: "Oops" } });
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(500);
  });

  it("returns ServerError for any 5xx status", () => {
    const err = createError(502, { error: { message: "Bad gateway" } });
    expect(err).toBeInstanceOf(ServerError);
  });

  it("returns generic JsonDBError for unknown status", () => {
    const err = createError(418, {
      error: { code: "TEAPOT", message: "I'm a teapot" },
    });
    expect(err).toBeInstanceOf(JsonDBError);
    expect(err.status).toBe(418);
    expect(err.code).toBe("TEAPOT");
  });

  it("uses defaults when body.error fields are missing", () => {
    const err = createError(500, {});
    expect(err.message).toBe("Unknown error");
    expect(err.code).toBe("INTERNAL_ERROR"); // ServerError default
  });

  it("all error classes extend JsonDBError", () => {
    expect(new NotFoundError("test")).toBeInstanceOf(JsonDBError);
    expect(new ConflictError("test")).toBeInstanceOf(JsonDBError);
    expect(new ValidationError("test")).toBeInstanceOf(JsonDBError);
    expect(new UnauthorizedError()).toBeInstanceOf(JsonDBError);
    expect(new ForbiddenError()).toBeInstanceOf(JsonDBError);
    expect(new QuotaExceededError("test")).toBeInstanceOf(JsonDBError);
    expect(new RateLimitError()).toBeInstanceOf(JsonDBError);
    expect(new DocumentTooLargeError("test")).toBeInstanceOf(JsonDBError);
    expect(new ServerError()).toBeInstanceOf(JsonDBError);
  });

  it("all error classes extend Error", () => {
    expect(new NotFoundError("test")).toBeInstanceOf(Error);
    expect(new ServerError()).toBeInstanceOf(Error);
  });

  it("error classes have correct name property", () => {
    expect(new NotFoundError("test").name).toBe("NotFoundError");
    expect(new ConflictError("test").name).toBe("ConflictError");
    expect(new ValidationError("test").name).toBe("ValidationError");
    expect(new UnauthorizedError().name).toBe("UnauthorizedError");
    expect(new ForbiddenError().name).toBe("ForbiddenError");
    expect(new QuotaExceededError("test").name).toBe("QuotaExceededError");
    expect(new RateLimitError().name).toBe("RateLimitError");
    expect(new DocumentTooLargeError("test").name).toBe("DocumentTooLargeError");
    expect(new ServerError().name).toBe("ServerError");
  });
});
