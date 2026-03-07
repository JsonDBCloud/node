import { describe, it, expect, vi, beforeEach } from "vitest";
import { Collection, QueryBuilder } from "./collection";
import { JsonDB } from "./client";
import type { JsonDBConfig } from "./types";
import { NotFoundError, ServerError } from "./errors";

function createMockFetch(response: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

const baseConfig: JsonDBConfig = {
  apiKey: "jdb_sk_test_1234567890abcdef1234567890abcdef12345678",
  project: "testns",
  baseUrl: "https://api.jsondb.cloud",
  retry: { enabled: false },
};

describe("Collection", () => {
  describe("URL construction", () => {
    it("builds correct base URL for collection", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list();

      expect(mockFetch).toHaveBeenCalledOnce();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe(
        "https://api.jsondb.cloud/testns/users",
      );
    });

    it("builds correct URL for get by ID", async () => {
      const mockFetch = createMockFetch({ _id: "doc1", name: "Alice" });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.get("doc1");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe(
        "https://api.jsondb.cloud/testns/users/doc1",
      );
    });

    it("strips trailing slash from baseUrl", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", {
        ...baseConfig,
        baseUrl: "https://api.jsondb.cloud/",
        fetch: mockFetch,
      });

      await col.list();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toMatch(/^https:\/\/api\.jsondb\.cloud\//);
    });
  });

  describe("headers", () => {
    it("sends Authorization Bearer header", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.get("doc1");

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${baseConfig.apiKey}`,
      );
    });

    it("sends Content-Type for JSON body", async () => {
      const mockFetch = createMockFetch({ _id: "new" });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.create({ name: "Alice" });

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/json",
      );
    });

    it("sends merge-patch content type for patch", async () => {
      const mockFetch = createMockFetch({ _id: "doc1" });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.patch("doc1", { name: "Bob" });

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/merge-patch+json",
      );
    });

    it("sends json-patch content type for jsonPatch", async () => {
      const mockFetch = createMockFetch({ _id: "doc1" });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.jsonPatch("doc1", [
        { op: "replace", path: "/name", value: "Bob" },
      ]);

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/json-patch+json",
      );
    });

    it("includes custom headers", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", {
        ...baseConfig,
        headers: { "X-Custom": "hello" },
        fetch: mockFetch,
      });

      await col.get("doc1");

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["X-Custom"]).toBe(
        "hello",
      );
    });
  });

  describe("HTTP methods", () => {
    it("uses GET for get()", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.get("doc1");
      expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    });

    it("uses POST for create()", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.create({ name: "Alice" });
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });

    it("uses POST with ID path for create with explicit id", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.create({ name: "Alice" }, { id: "alice-1" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/alice-1");
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });

    it("uses PUT for update()", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.update("doc1", { name: "Bob" });
      expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    });

    it("uses PATCH for patch()", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.patch("doc1", { name: "Bob" });
      expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
    });

    it("uses DELETE for delete()", async () => {
      const mockFetch = createMockFetch(undefined, 204);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.delete("doc1");
      expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    });

    it("uses POST for bulk()", async () => {
      const mockFetch = createMockFetch({ results: [], summary: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.bulk([{ method: "POST", body: { name: "Alice" } }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/_bulk");
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });
  });

  describe("request body", () => {
    it("sends JSON body for create", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.create({ name: "Alice", age: 30 });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({ name: "Alice", age: 30 });
    });

    it("sends JSON body for update", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.update("doc1", { name: "Bob" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({ name: "Bob" });
    });

    it("does not send body for GET requests", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.get("doc1");
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });
  });

  describe("list query params", () => {
    it("adds filter params to URL", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list({ filter: { status: "active" } });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("filter%5Bstatus%5D=active");
    });

    it("adds operator filter params", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list({ filter: { age: { $gt: 18, $lt: 65 } } });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("filter%5Bage%5D%5Bgt%5D=18");
      expect(url).toContain("filter%5Bage%5D%5Blt%5D=65");
    });

    it("adds sort param", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list({ sort: "-createdAt" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("sort=-createdAt");
    });

    it("adds pagination params", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list({ limit: 10, offset: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });

    it("adds select param", async () => {
      const mockFetch = createMockFetch({ data: [], meta: {} });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.list({ select: ["name", "email"] });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("select=name%2Cemail");
    });
  });

  describe("count", () => {
    it("sends count=true query param", async () => {
      const mockFetch = createMockFetch({ count: 42 });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      const count = await col.count();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("count=true");
      expect(count).toBe(42);
    });

    it("sends filter with count", async () => {
      const mockFetch = createMockFetch({ count: 5 });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.count({ status: "active" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("count=true");
      expect(url).toContain("filter%5Bstatus%5D=active");
    });
  });

  describe("error handling", () => {
    it("throws NotFoundError on 404", async () => {
      const mockFetch = createMockFetch(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Not found" } },
        404,
      );
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await expect(col.get("missing")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns undefined for 204 response", async () => {
      const mockFetch = createMockFetch(undefined, 204);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      const result = await col.delete("doc1");
      expect(result).toBeUndefined();
    });
  });

  describe("schema operations", () => {
    it("uses PUT for setSchema", async () => {
      const mockFetch = createMockFetch({});
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.setSchema({ type: "object", properties: { name: { type: "string" } } });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/_schema");
      expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    });

    it("uses GET for getSchema", async () => {
      const mockFetch = createMockFetch({ schema: { type: "object" } });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      const schema = await col.getSchema();
      expect(schema).toEqual({ type: "object" });
      expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    });

    it("uses DELETE for removeSchema", async () => {
      const mockFetch = createMockFetch(undefined, 204);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.removeSchema();
      expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("version history", () => {
    it("listVersions calls GET /{project}/{collection}/{id}/versions", async () => {
      const mockFetch = createMockFetch({ versions: [{ version: 1, action: "create", timestamp: "2024-01-01T00:00:00Z" }] });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.listVersions("doc1");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/doc1/versions");
      expect(result.versions).toHaveLength(1);
    });

    it("getVersion calls GET /{project}/{collection}/{id}/versions/{v}", async () => {
      const mockFetch = createMockFetch({ _id: "doc1", name: "old", $version: 1 });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.getVersion("doc1", 1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/doc1/versions/1");
      expect(result.name).toBe("old");
    });

    it("restoreVersion calls POST /{project}/{collection}/{id}/versions/{v}/restore", async () => {
      const mockFetch = createMockFetch({ _id: "doc1", name: "restored", $version: 3 });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.restoreVersion("doc1", 1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.jsondb.cloud/testns/users/doc1/versions/1/restore");
      expect(opts.method).toBe("POST");
      expect(result.name).toBe("restored");
    });

    it("diffVersions calls GET with from and to params", async () => {
      const diff = { added: {}, removed: {}, changed: { name: { from: "a", to: "b" } } };
      const mockFetch = createMockFetch(diff);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.diffVersions("doc1", 1, 2);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/doc1/versions/diff");
      expect(url).toContain("from=1");
      expect(url).toContain("to=2");
      expect(result.changed.name.to).toBe("b");
    });
  });

  describe("webhooks", () => {
    it("createWebhook calls POST /_webhooks", async () => {
      const webhook = { _id: "wh1", url: "https://example.com/hook", events: ["document.created"], status: "active" };
      const mockFetch = createMockFetch(webhook);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.createWebhook({ url: "https://example.com/hook", events: ["document.created"] });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks");
      expect(opts.method).toBe("POST");
      expect(result._id).toBe("wh1");
    });

    it("listWebhooks calls GET /_webhooks", async () => {
      const mockFetch = createMockFetch({ data: [{ _id: "wh1", url: "https://example.com/hook" }] });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.listWebhooks();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks");
      expect(result.data).toHaveLength(1);
    });

    it("getWebhook calls GET /_webhooks/{id}", async () => {
      const mockFetch = createMockFetch({ _id: "wh1", recentDeliveries: [] });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.getWebhook("wh1");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks/wh1");
      expect(result._id).toBe("wh1");
    });

    it("updateWebhook calls PUT /_webhooks/{id}", async () => {
      const mockFetch = createMockFetch({ _id: "wh1", url: "https://new.com/hook" });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.updateWebhook("wh1", { url: "https://new.com/hook" });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks/wh1");
      expect(opts.method).toBe("PUT");
    });

    it("deleteWebhook calls DELETE /_webhooks/{id}", async () => {
      const mockFetch = createMockFetch(undefined, 204);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.deleteWebhook("wh1");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks/wh1");
      expect(opts.method).toBe("DELETE");
    });

    it("testWebhook calls POST /_webhooks/{id}/test", async () => {
      const mockFetch = createMockFetch({ _id: "del1", statusCode: 200, responseTime: 150 });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.testWebhook("wh1");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_webhooks/wh1/test");
      expect(opts.method).toBe("POST");
      expect(result.statusCode).toBe(200);
    });
  });

  describe("import/export", () => {
    it("importDocuments calls POST /_import", async () => {
      const mockFetch = createMockFetch({ results: [{ status: 201, document: { _id: "d1" } }] });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const res = await col.importDocuments([{ name: "Alice" }], { onConflict: "skip" });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("/_import");
      expect(url).toContain("onConflict=skip");
      expect(opts.method).toBe("POST");
      expect(res.results).toHaveLength(1);
    });

    it("importDocuments works without options", async () => {
      const mockFetch = createMockFetch({ results: [] });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.importDocuments([{ name: "Alice" }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_import");
    });

    it("exportDocuments calls GET /_export", async () => {
      const mockFetch = createMockFetch([{ _id: "d1", name: "Alice" }]);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      const result = await col.exportDocuments();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://api.jsondb.cloud/testns/users/_export");
      expect(result).toHaveLength(1);
    });

    it("exportDocuments passes filter params", async () => {
      const mockFetch = createMockFetch([]);
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });
      await col.exportDocuments({ filter: { role: "admin" } });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("filter%5Brole%5D=admin");
    });
  });

  describe("bulkCreate", () => {
    it("maps docs to POST bulk operations", async () => {
      const mockFetch = createMockFetch({
        results: [],
        summary: { total: 2, succeeded: 2, failed: 0 },
      });
      const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

      await col.bulkCreate([{ name: "Alice" }, { name: "Bob" }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.operations).toEqual([
        { method: "POST", body: { name: "Alice" } },
        { method: "POST", body: { name: "Bob" } },
      ]);
    });
  });
});

describe("QueryBuilder", () => {
  it("builds equality filter with == operator", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("status", "==", "active").exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bstatus%5D=active");
  });

  it("builds inequality filter with != operator", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("status", "!=", "deleted").exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bstatus%5D%5Bneq%5D=deleted");
  });

  it("builds gt filter with > operator", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("age", ">", 18).exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bage%5D%5Bgt%5D=18");
  });

  it("supports chaining multiple where clauses", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col
      .where("age", ">=", 18)
      .where("status", "==", "active")
      .exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bage%5D%5Bgte%5D=18");
    expect(url).toContain("filter%5Bstatus%5D=active");
  });

  it("supports orderBy", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("status", "==", "active").orderBy("-createdAt").exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sort=-createdAt");
  });

  it("supports limit and offset", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("status", "==", "active").limit(5).offset(10).exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
    expect(url).toContain("offset=10");
  });

  it("supports select", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col
      .where("status", "==", "active")
      .select("name", "email")
      .exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("select=name%2Cemail");
  });

  it("supports contains operator", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col.where("name", "contains", "ali").exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bname%5D%5Bcontains%5D=ali");
  });

  it("supports full fluent chain", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const col = new Collection("users", { ...baseConfig, fetch: mockFetch });

    await col
      .where("age", ">=", 18)
      .where("status", "==", "active")
      .orderBy("-name")
      .limit(10)
      .offset(5)
      .select("name", "age")
      .exec();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5Bage%5D%5Bgte%5D=18");
    expect(url).toContain("filter%5Bstatus%5D=active");
    expect(url).toContain("sort=-name");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
    expect(url).toContain("select=name%2Cage");
  });
});

describe("JsonDB client", () => {
  it("requires apiKey", () => {
    expect(() => new JsonDB({ apiKey: "" })).toThrow("apiKey is required");
  });

  it("creates collection instances", () => {
    const db = new JsonDB({ apiKey: "jdb_sk_test_abc" });
    const col = db.collection("users");
    expect(col).toBeInstanceOf(Collection);
  });

  it("uses default project", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const db = new JsonDB({
      apiKey: "jdb_sk_test_abc",
      fetch: mockFetch,
    });

    await db.collection("users").list();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v1/users");
  });

  it("uses custom project", async () => {
    const mockFetch = createMockFetch({ data: [], meta: {} });
    const db = new JsonDB({
      apiKey: "jdb_sk_test_abc",
      project: "myapp",
      fetch: mockFetch,
    });

    await db.collection("users").list();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/myapp/users");
  });

  it("listCollections fetches GET /{project}", async () => {
    const mockFetch = createMockFetch({ data: ["users", "posts", "comments"] });
    const db = new JsonDB({
      apiKey: "jdb_sk_test_abc",
      project: "v1",
      fetch: mockFetch,
    });

    const result = await db.listCollections();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://api.jsondb.cloud/v1");
    expect(result).toEqual(["users", "posts", "comments"]);
  });
});
