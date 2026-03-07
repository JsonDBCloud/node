import type { StreamOptions, StreamEventData, StreamEventType, JsonDBConfig } from "./types";

type EventHandler<T> = (data: T, raw: StreamEventData) => void;

/**
 * SSE change stream for a collection.
 * Emits events when documents are created, updated, or deleted.
 */
export class ChangeStream<T extends Record<string, unknown> = Record<string, unknown>> {
  private abortController: AbortController | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<(...args: any[]) => void>>();
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private lastEventId: string | undefined;
  private closed = false;
  private readonly url: string;
  private readonly config: JsonDBConfig;

  constructor(url: string, config: JsonDBConfig, options?: StreamOptions) {
    this.url = this.buildUrl(url, options);
    this.config = config;
    this.connect();
  }

  private buildUrl(base: string, options?: StreamOptions): string {
    const url = new URL(base);
    if (options?.events && options.events.length > 0) {
      url.searchParams.set("events", options.events.join(","));
    }
    if (options?.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        url.searchParams.set(`filter[${key}]`, String(value));
      }
    }
    return url.toString();
  }

  private async connect(): Promise<void> {
    if (this.closed) return;

    this.abortController = new AbortController();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "text/event-stream",
      ...(this.config.headers || {}),
    };
    if (this.lastEventId) {
      headers["Last-Event-ID"] = this.lastEventId;
    }

    try {
      const fetchFn = this.config.fetch || globalThis.fetch.bind(globalThis);
      const response = await fetchFn(this.url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        this.emit("error", new Error(`Stream connection failed: ${response.status}`));
        this.scheduleReconnect();
        return;
      }

      if (!response.body) {
        this.emit("error", new Error("No response body"));
        this.scheduleReconnect();
        return;
      }

      this.reconnectDelay = 1000;
      this.emit("open", undefined);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          this.parseSSEMessage(message);
        }
      }

      // Connection ended normally — reconnect
      if (!this.closed) {
        this.scheduleReconnect();
      }
    } catch (err) {
      if (this.closed) return;
      if ((err as Error).name === "AbortError") return;
      this.emit("error", err);
      this.scheduleReconnect();
    }
  }

  private parseSSEMessage(raw: string): void {
    let eventType = "";
    let data = "";
    let id = "";

    for (const line of raw.split("\n")) {
      if (line.startsWith(": ")) continue; // comment (heartbeat)
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
      else if (line.startsWith("id: ")) id = line.slice(4);
    }

    if (id) this.lastEventId = id;
    if (!eventType || !data) return;

    try {
      const parsed = JSON.parse(data) as StreamEventData<T>;
      const shortType = eventType.replace("document.", "") as StreamEventType;

      if (shortType === "created") {
        this.emit("created", parsed.document as T & { _id: string }, parsed);
      } else if (shortType === "updated") {
        this.emit("updated", parsed.document as T & { _id: string }, parsed);
      } else if (shortType === "deleted") {
        this.emit("deleted", parsed.documentId || "", parsed);
      }

      this.emit("change", parsed, parsed);
    } catch {
      // Ignore malformed messages
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch {
          // Don't let handler errors break the stream
        }
      }
    }
  }

  /** Register an event handler */
  on(event: "created", handler: (doc: T & { _id: string }, raw: StreamEventData<T>) => void): this;
  on(event: "updated", handler: (doc: T & { _id: string }, raw: StreamEventData<T>) => void): this;
  on(event: "deleted", handler: (id: string, raw: StreamEventData<T>) => void): this;
  on(event: "change", handler: (data: StreamEventData<T>, raw: StreamEventData<T>) => void): this;
  on(event: "error", handler: (error: unknown) => void): this;
  on(event: "open", handler: () => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  /** Remove an event handler */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler: (...args: any[]) => void): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  /** Close the stream connection */
  close(): void {
    this.closed = true;
    this.abortController?.abort();
    this.handlers.clear();
  }
}
