# @jsondb-cloud/client

The official JavaScript/TypeScript SDK for [jsondb.cloud](https://jsondb.cloud) — a hosted JSON document database.

[![npm version](https://img.shields.io/npm/v/@jsondb-cloud/client)](https://www.npmjs.com/package/@jsondb-cloud/client)
[![npm downloads](https://img.shields.io/npm/dm/@jsondb-cloud/client)](https://www.npmjs.com/package/@jsondb-cloud/client)
[![CI](https://github.com/JsonDBCloud/node/actions/workflows/ci.yml/badge.svg)](https://github.com/JsonDBCloud/node/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Bundle size](https://img.shields.io/bundlephobia/min/@jsondb-cloud/client)](https://bundlephobia.com/package/@jsondb-cloud/client)
[![GitHub stars](https://img.shields.io/github/stars/JsonDBCloud/node)](https://github.com/JsonDBCloud/node)
[![Last commit](https://img.shields.io/github/last-commit/JsonDBCloud/node)](https://github.com/JsonDBCloud/node)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install @jsondb-cloud/client
```

## Quick Start

```typescript
import { JsonDB } from "@jsondb-cloud/client";

const db = new JsonDB({ apiKey: "jdb_sk_live_xxxx" });
const users = db.collection<{ name: string; email: string }>("users");

// Create
const alice = await users.create({ name: "Alice", email: "alice@example.com" });

// Read
const user = await users.get(alice._id);

// List with filter
const admins = await users.list({
  filter: { role: "admin" },
  sort: "-$createdAt",
  limit: 10,
});

// Update
await users.patch(alice._id, { email: "alice@newdomain.com" });

// Delete
await users.delete(alice._id);
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | — | **Required.** API key (`jdb_sk_live_...` or `jdb_sk_test_...`) |
| `project` | `string` | `"v1"` | Project identifier |
| `baseUrl` | `string` | `"https://api.jsondb.cloud"` | API base URL |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `retry` | `object` | `{ enabled: true, maxRetries: 3 }` | Retry with exponential backoff |
| `headers` | `Record<string, string>` | `{}` | Extra headers for every request |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

## API

### Collection CRUD

- `create(doc, options?)` — Create a document
- `get(id)` — Get a document by ID
- `list(options?)` — List documents with filtering, sorting, pagination
- `count(filter?)` — Count documents matching an optional filter
- `update(id, doc)` — Replace a document entirely
- `patch(id, partial)` — Partial update (merge-patch)
- `jsonPatch(id, operations)` — Apply JSON Patch operations (RFC 6902)
- `delete(id)` — Delete a document

### Query Builder

- `where(field, op, value)` — Start a fluent query (`==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `in`)
- `orderBy(field)` — Sort results
- `limit(n)` / `offset(n)` — Paginate
- `select(...fields)` — Pick fields
- `exec()` — Execute the query

### Bulk Operations

- `bulk(operations)` — Execute mixed bulk operations
- `bulkCreate(docs)` — Create multiple documents

### Schema Validation

- `setSchema(schema)` — Set a JSON Schema for the collection
- `getSchema()` — Get the current schema
- `removeSchema()` — Remove the schema
- `validate(doc)` — Validate a document without storing

### Version History

- `listVersions(id)` — List all versions of a document
- `getVersion(id, version)` — Get a document at a specific version
- `restoreVersion(id, version)` — Restore to a specific version
- `diffVersions(id, from, to)` — Diff two versions

### Webhooks

- `createWebhook(options)` — Register a webhook
- `listWebhooks()` — List all webhooks
- `getWebhook(id)` — Get webhook details with recent deliveries
- `updateWebhook(id, options)` — Update a webhook
- `deleteWebhook(id)` — Delete a webhook
- `testWebhook(id)` — Send a test event

### Import / Export

- `importDocuments(docs, options?)` — Import documents (fail/skip/overwrite on conflict)
- `exportDocuments(options?)` — Export all documents

### Real-time Streaming

- `stream(options?)` — Subscribe to real-time changes via SSE
  - Events: `created`, `updated`, `deleted`, `change`

## Error Handling

```typescript
import { JsonDB, NotFoundError, ValidationError } from "@jsondb-cloud/client";

try {
  const user = await users.get("nonexistent");
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log("Document not found:", err.documentId);
  }
}
```

All errors extend `JsonDBError` which has `.code`, `.status`, and `.details` properties.

| Error | Status | Code |
|-------|--------|------|
| `NotFoundError` | 404 | `DOCUMENT_NOT_FOUND` |
| `ValidationError` | 400 | `VALIDATION_FAILED` |
| `ConflictError` | 409 | `CONFLICT` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `RateLimitError` | 429 | `RATE_LIMITED` |
| `QuotaExceededError` | 429 | `QUOTA_EXCEEDED` |
| `DocumentTooLargeError` | 413 | `DOCUMENT_TOO_LARGE` |
| `ServerError` | 500 | `INTERNAL_ERROR` |

## Documentation

Full documentation at [jsondb.cloud/docs](https://jsondb.cloud/docs).

## Related Packages

| Package | Description |
|---------|-------------|
| [@jsondb-cloud/client](https://www.npmjs.com/package/@jsondb-cloud/client) | JavaScript/TypeScript SDK |
| [@jsondb-cloud/mcp](https://www.npmjs.com/package/@jsondb-cloud/mcp) | MCP server for AI agents |
| [@jsondb-cloud/cli](https://www.npmjs.com/package/@jsondb-cloud/cli) | CLI tool |
| [jsondb-cloud](https://pypi.org/project/jsondb-cloud/) (PyPI) | Python SDK |

## License

MIT
