import type { JsonDBConfig } from "./types";
import { Collection } from "./collection";
import { createError } from "./errors";

/**
 * jsondb.cloud client
 *
 * @example
 * ```typescript
 * import { JsonDB } from '@jsondb-cloud/client';
 *
 * const db = new JsonDB({ apiKey: 'jdb_sk_live_...' });
 * const users = db.collection<{ name: string; email: string }>('users');
 *
 * const alice = await users.create({ name: 'Alice', email: 'alice@example.com' });
 * const found = await users.get(alice._id);
 * ```
 */
export class JsonDB {
  private readonly config: JsonDBConfig;

  constructor(config: JsonDBConfig) {
    if (!config.apiKey) {
      throw new Error("apiKey is required");
    }
    this.config = {
      project: "v1",
      baseUrl: "https://api.jsondb.cloud",
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Get a typed collection reference
   *
   * @param name - Collection name (e.g. 'users', 'posts')
   * @returns A Collection instance with typed methods
   */
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): Collection<T> {
    return new Collection<T>(name, this.config);
  }

  /** List all collections in the project */
  async listCollections(): Promise<string[]> {
    const baseUrl = (this.config.baseUrl || "https://api.jsondb.cloud").replace(/\/$/, "");
    const project = this.config.project || "v1";
    const fetchFn = this.config.fetch || globalThis.fetch.bind(globalThis);
    const res = await fetchFn(`${baseUrl}/${project}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
    });
    if (!res.ok) {
      const data = await res.json();
      throw createError(res.status, data);
    }
    const data = await res.json();
    return data.data ?? data;
  }
}
