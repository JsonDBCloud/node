/** Document metadata fields auto-managed by jsondb.cloud */
export interface DocumentMeta {
  _id: string;
  $createdAt: string;
  $updatedAt: string;
  $version: number;
}

/** A stored document = user fields + metadata */
export type Document<T> = T & DocumentMeta;

/** Paginated list response */
export interface ListResponse<T> {
  data: Document<T>[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Filter operators for queries */
export interface FilterOperators {
  $eq?: string | number | boolean;
  $neq?: string | number | boolean;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $contains?: string;
  $in?: (string | number)[];
  $exists?: boolean;
}

/** Query filter — either a direct value or operators */
export type FilterValue = string | number | boolean | FilterOperators;

/** Query options for listing documents */
export interface ListOptions<T = Record<string, unknown>> {
  filter?: Partial<Record<keyof T | string, FilterValue>>;
  sort?: string;
  limit?: number;
  offset?: number;
  select?: string[];
}

/** Bulk operation item */
export interface BulkOperation {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  id?: string;
  body?: Record<string, unknown>;
}

/** Bulk operation result */
export interface BulkResult {
  results: { status: number; _id: string; ok: boolean; error?: string }[];
  summary: { total: number; succeeded: number; failed: number };
}

/** Stream event types */
export type StreamEventType = "created" | "updated" | "deleted";

/** Stream options */
export interface StreamOptions {
  events?: StreamEventType[];
  filter?: Record<string, string | number | boolean>;
}

/** Stream event data */
export interface StreamEventData<T = Record<string, unknown>> {
  event: string;
  timestamp: string;
  collection: string;
  project: string;
  document?: T & { _id: string; $version?: number };
  documentId?: string;
  previousVersion?: number;
}

/** Version history entry */
export interface VersionEntry {
  version: number;
  action: string;
  timestamp: string;
  size?: number;
}

/** Version diff result */
export interface VersionDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
}

/** Webhook resource */
export interface Webhook {
  _id: string;
  collection: string;
  url: string;
  events: string[];
  description?: string;
  status: "active" | "disabled";
  createdAt: string;
}

/** Options for creating a webhook */
export interface WebhookCreateOptions {
  url: string;
  events: ("document.created" | "document.updated" | "document.deleted")[];
  description?: string;
  secret?: string;
}

/** Options for updating a webhook */
export interface WebhookUpdateOptions {
  url?: string;
  events?: ("document.created" | "document.updated" | "document.deleted")[];
  description?: string;
  status?: "active" | "disabled";
}

/** Webhook delivery record */
export interface WebhookDelivery {
  _id: string;
  webhookId: string;
  timestamp: string;
  statusCode: number;
  responseTime: number;
}

/** Webhook with recent delivery history */
export interface WebhookWithDeliveries extends Webhook {
  recentDeliveries: WebhookDelivery[];
}

/** Options for importing documents */
export interface ImportOptions {
  onConflict?: "fail" | "skip" | "overwrite";
  idField?: string;
}

/** Import result */
export interface ImportResult {
  results: { status: number; document?: Record<string, unknown>; error?: string }[];
}

/** Options for exporting documents */
export interface ExportOptions {
  filter?: Record<string, FilterValue>;
}

/** Client configuration */
export interface JsonDBConfig {
  /** API key (jdb_sk_live_... or jdb_sk_test_...) */
  apiKey: string;
  /** Project (default: 'default') */
  project?: string;
  /** Base URL (default: 'https://api.jsondb.cloud') */
  baseUrl?: string;
  /** Retry configuration */
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  };
  /** Custom fetch function */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Extra headers for every request */
  headers?: Record<string, string>;
}
