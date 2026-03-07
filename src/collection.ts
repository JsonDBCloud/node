import type {
  Document,
  ListResponse,
  ListOptions,
  FilterValue,
  FilterOperators,
  BulkOperation,
  BulkResult,
  JsonDBConfig,
  StreamOptions,
  VersionEntry,
  VersionDiff,
  Webhook,
  WebhookCreateOptions,
  WebhookUpdateOptions,
  WebhookWithDeliveries,
  WebhookDelivery,
  ImportOptions,
  ImportResult,
  ExportOptions,
} from "./types";
import { createError } from "./errors";
import { ChangeStream } from "./stream";

export class Collection<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly name: string;
  private readonly config: Required<
    Pick<JsonDBConfig, "apiKey" | "project" | "baseUrl" | "timeout">
  > & {
    retry: { enabled: boolean; maxRetries: number; baseDelay: number; maxDelay: number };
    fetchFn: typeof globalThis.fetch;
    headers: Record<string, string>;
  };

  constructor(name: string, config: JsonDBConfig) {
    this.name = name;
    this.config = {
      apiKey: config.apiKey,
      project: config.project || "v1",
      baseUrl: (config.baseUrl || "https://api.jsondb.cloud").replace(/\/$/, ""),
      timeout: config.timeout || 30000,
      retry: {
        enabled: config.retry?.enabled ?? true,
        maxRetries: config.retry?.maxRetries ?? 3,
        baseDelay: config.retry?.baseDelay ?? 1000,
        maxDelay: config.retry?.maxDelay ?? 10000,
      },
      fetchFn: config.fetch || globalThis.fetch.bind(globalThis),
      headers: config.headers || {},
    };
  }

  private url(path: string = ""): string {
    const base = `${this.config.baseUrl}/${this.config.project}/${this.name}`;
    return path ? `${base}/${path}` : base;
  }

  private async request<R>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<R> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      ...this.config.headers,
      ...extraHeaders,
    };

    const opts: RequestInit = { method, headers };
    if (body !== undefined && ["POST", "PUT", "PATCH"].includes(method)) {
      opts.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;
    const maxAttempts = this.config.retry.enabled ? this.config.retry.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await this.config.fetchFn(this.url(path), opts);

        // Retry on 429 or 5xx
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
          const delay = Math.min(
            this.config.retry.baseDelay * Math.pow(2, attempt),
            this.config.retry.maxDelay,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (res.status === 204) return undefined as R;

        const data = await res.json();
        if (!res.ok) throw createError(res.status, data);
        return data as R;
      } catch (e) {
        lastError = e as Error;
        if (e && typeof e === "object" && "status" in e) throw e; // Known API error
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(
            this.config.retry.baseDelay * Math.pow(2, attempt),
            this.config.retry.maxDelay,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed");
  }

  /** Create a document with an auto-generated ID */
  async create(doc: T, options?: { id?: string }): Promise<Document<T>> {
    const path = options?.id || "";
    return this.request<Document<T>>("POST", path, doc);
  }

  /** Get a document by ID */
  async get(id: string): Promise<Document<T>> {
    return this.request<Document<T>>("GET", id);
  }

  /** List documents with optional filtering/sorting/pagination */
  async list(options?: ListOptions<T>): Promise<ListResponse<T>> {
    const params = new URLSearchParams();

    if (options?.filter) {
      for (const [field, value] of Object.entries(options.filter)) {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const ops = value as FilterOperators;
          if (ops.$eq !== undefined) params.set(`filter[${field}]`, String(ops.$eq));
          if (ops.$neq !== undefined) params.set(`filter[${field}][neq]`, String(ops.$neq));
          if (ops.$gt !== undefined) params.set(`filter[${field}][gt]`, String(ops.$gt));
          if (ops.$gte !== undefined) params.set(`filter[${field}][gte]`, String(ops.$gte));
          if (ops.$lt !== undefined) params.set(`filter[${field}][lt]`, String(ops.$lt));
          if (ops.$lte !== undefined) params.set(`filter[${field}][lte]`, String(ops.$lte));
          if (ops.$contains !== undefined) params.set(`filter[${field}][contains]`, ops.$contains);
          if (ops.$in !== undefined) params.set(`filter[${field}][in]`, ops.$in.join(","));
          if (ops.$exists !== undefined) params.set(`filter[${field}][exists]`, String(ops.$exists));
        } else {
          params.set(`filter[${field}]`, String(value as FilterValue));
        }
      }
    }

    if (options?.sort) params.set("sort", options.sort);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    if (options?.select) params.set("select", options.select.join(","));

    const qs = params.toString();
    return this.request<ListResponse<T>>("GET", qs ? `?${qs}` : "");
  }

  /** Replace a document entirely */
  async update(id: string, doc: T): Promise<Document<T>> {
    return this.request<Document<T>>("PUT", id, doc);
  }

  /** Merge-patch a document (partial update) */
  async patch(id: string, partial: Partial<T>): Promise<Document<T>> {
    return this.request<Document<T>>("PATCH", id, partial, {
      "Content-Type": "application/merge-patch+json",
    });
  }

  /** Apply JSON Patch operations (RFC 6902) */
  async jsonPatch(
    id: string,
    operations: { op: string; path: string; value?: unknown; from?: string }[],
  ): Promise<Document<T>> {
    return this.request<Document<T>>("PATCH", id, operations, {
      "Content-Type": "application/json-patch+json",
    });
  }

  /** Delete a document */
  async delete(id: string): Promise<void> {
    await this.request<void>("DELETE", id);
  }

  /** Bulk operations */
  async bulk(operations: BulkOperation[]): Promise<BulkResult> {
    return this.request<BulkResult>("POST", "_bulk", { operations });
  }

  /** Bulk create multiple documents */
  async bulkCreate(docs: T[]): Promise<BulkResult> {
    return this.bulk(docs.map((doc) => ({ method: "POST" as const, body: doc as Record<string, unknown> })));
  }

  /** Count documents matching an optional filter */
  async count(filter?: ListOptions<T>["filter"]): Promise<number> {
    const params = new URLSearchParams({ count: "true" });
    if (filter) {
      for (const [field, value] of Object.entries(filter)) {
        if (typeof value === "object" && value !== null) {
          const ops = value as FilterOperators;
          if (ops.$eq !== undefined) params.set(`filter[${field}]`, String(ops.$eq));
          if (ops.$neq !== undefined) params.set(`filter[${field}][neq]`, String(ops.$neq));
          if (ops.$gt !== undefined) params.set(`filter[${field}][gt]`, String(ops.$gt));
          if (ops.$gte !== undefined) params.set(`filter[${field}][gte]`, String(ops.$gte));
        } else {
          params.set(`filter[${field}]`, String(value as FilterValue));
        }
      }
    }
    const result = await this.request<{ count: number }>("GET", `?${params.toString()}`);
    return result.count;
  }

  /** Set a JSON Schema for this collection */
  async setSchema(schema: Record<string, unknown>): Promise<void> {
    await this.request("PUT", "_schema", schema);
  }

  /** Get the current schema for this collection */
  async getSchema(): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.request<{ schema: Record<string, unknown> }>("GET", "_schema");
      return result.schema;
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
        return null;
      }
      throw e;
    }
  }

  /** Remove the schema from this collection */
  async removeSchema(): Promise<void> {
    await this.request("DELETE", "_schema");
  }

  /** Validate a document against the collection schema without storing */
  async validate(doc: T): Promise<{ valid: boolean; errors: { path: string; message: string; keyword: string }[] }> {
    return this.request("POST", "_validate", doc);
  }

  // ── Version History ─────────────────────────────────────────

  /** List all versions of a document */
  async listVersions(id: string): Promise<{ versions: VersionEntry[] }> {
    return this.request("GET", `${id}/versions`);
  }

  /** Get a document at a specific version */
  async getVersion(id: string, version: number): Promise<Document<T>> {
    return this.request("GET", `${id}/versions/${version}`);
  }

  /** Restore a document to a specific version */
  async restoreVersion(id: string, version: number): Promise<Document<T>> {
    return this.request("POST", `${id}/versions/${version}/restore`);
  }

  /** Diff two versions of a document (Pro feature) */
  async diffVersions(id: string, from: number, to: number): Promise<VersionDiff> {
    return this.request("GET", `${id}/versions/diff?from=${from}&to=${to}`);
  }

  // ── Webhooks ───────────────────────────────────────────────

  /** Register a webhook on this collection */
  async createWebhook(options: WebhookCreateOptions): Promise<Webhook> {
    return this.request("POST", "_webhooks", options);
  }

  /** List all webhooks for this collection */
  async listWebhooks(): Promise<{ data: Webhook[] }> {
    return this.request("GET", "_webhooks");
  }

  /** Get webhook details including recent deliveries */
  async getWebhook(webhookId: string): Promise<WebhookWithDeliveries> {
    return this.request("GET", `_webhooks/${webhookId}`);
  }

  /** Update a webhook */
  async updateWebhook(webhookId: string, options: WebhookUpdateOptions): Promise<Webhook> {
    return this.request("PUT", `_webhooks/${webhookId}`, options);
  }

  /** Delete a webhook */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request("DELETE", `_webhooks/${webhookId}`);
  }

  /** Send a test event to a webhook */
  async testWebhook(webhookId: string): Promise<WebhookDelivery> {
    return this.request("POST", `_webhooks/${webhookId}/test`);
  }

  // ── Import / Export ────────────────────────────────────────

  /** Import documents into this collection */
  async importDocuments(documents: Record<string, unknown>[], options?: ImportOptions): Promise<ImportResult> {
    const params = new URLSearchParams();
    if (options?.onConflict) params.set("onConflict", options.onConflict);
    if (options?.idField) params.set("idField", options.idField);
    const qs = params.toString();
    return this.request("POST", `_import${qs ? `?${qs}` : ""}`, documents);
  }

  /** Export all documents from this collection */
  async exportDocuments(options?: ExportOptions): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    if (options?.filter) {
      for (const [field, value] of Object.entries(options.filter)) {
        if (typeof value === "object" && value !== null) {
          for (const [op, val] of Object.entries(value as Record<string, unknown>)) {
            params.set(`filter[${field}][${op.replace("$", "")}]`, String(val));
          }
        } else {
          params.set(`filter[${field}]`, String(value));
        }
      }
    }
    const qs = params.toString();
    return this.request("GET", `_export${qs ? `?${qs}` : ""}`);
  }

  /** Subscribe to real-time changes via SSE (Pro feature) */
  stream(options?: StreamOptions): ChangeStream<T> {
    return new ChangeStream<T>(this.url("_stream"), {
      apiKey: this.config.apiKey,
      project: this.config.project,
      baseUrl: this.config.baseUrl,
      fetch: this.config.fetchFn,
      headers: this.config.headers,
    }, options);
  }

  /** Create a fluent query builder */
  where(field: string, op: string, value: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>(this).where(field, op, value);
  }
}

/** Fluent query builder */
export class QueryBuilder<T extends Record<string, unknown>> {
  private collection: Collection<T>;
  private filters: Record<string, FilterValue> = {};
  private sortField?: string;
  private limitVal?: number;
  private offsetVal?: number;
  private selectFields?: string[];

  constructor(collection: Collection<T>) {
    this.collection = collection;
  }

  where(field: string, op: string, value: unknown): this {
    const opMap: Record<string, string> = {
      "==": "$eq",
      "!=": "$neq",
      ">": "$gt",
      ">=": "$gte",
      "<": "$lt",
      "<=": "$lte",
      contains: "$contains",
      in: "$in",
    };

    const filterOp = opMap[op];
    if (filterOp && filterOp !== "$eq") {
      this.filters[field] = { [filterOp]: value } as FilterOperators;
    } else {
      this.filters[field] = value as FilterValue;
    }
    return this;
  }

  orderBy(field: string): this {
    this.sortField = field;
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  offset(n: number): this {
    this.offsetVal = n;
    return this;
  }

  select(...fields: string[]): this {
    this.selectFields = fields;
    return this;
  }

  async exec(): Promise<ListResponse<T>> {
    return this.collection.list({
      filter: this.filters as ListOptions<T>["filter"],
      sort: this.sortField,
      limit: this.limitVal,
      offset: this.offsetVal,
      select: this.selectFields,
    });
  }
}
