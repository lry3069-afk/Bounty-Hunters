import { assert, describe, it } from "@effect/vitest";
import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Metric from "effect/Metric";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";

import {
  cacheHitsTotal,
  cacheMissesTotal,
  getCapability,
  getModelList,
  makeProviderCache,
  publishConfigChange,
} from "./ProviderCache.ts";

const hasCounterSnapshot = (
  snapshots: ReadonlyArray<Metric.Metric.Snapshot>,
  name: string,
  expectedCount: number,
): boolean =>
  snapshots.some(
    (s) =>
      s.id === name &&
      "count" in s &&
      (s as { count: number }).count === expectedCount,
  );

describe("ProviderCache", () => {
  describe("makeProviderCache", () => {
    it.effect("creates both model list and capability caches", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        assert.isDefined(cache.modelListCache);
        assert.isDefined(cache.capabilityCache);
        yield* Scope.close(cache.invalidateForProvider("p1") as unknown as Effect.Effect<void, never, Scope.Scope>, (() => {
          const tag = Symbol();
          return { _tag: "Success", value: undefined } as unknown as { readonly _tag: symbol };
        })());
      }).pipe(Effect.scoped),
    );

    it.effect("invalidateForProvider drops entries for that provider only", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        const key = "p1::models::list1";

        // Populate
        yield* Cache.set(cache.modelListCache, key, { models: ["gpt-4"] });
        const before = yield* Cache.hit(cache.modelListCache, key);
        assert.isTrue(before !== undefined);

        // Invalidate
        yield* cache.invalidateForProvider("p1");

        const after = yield* Cache.hit(cache.modelListCache, key);
        assert.isTrue(after === undefined);
      }).pipe(Effect.scoped),
    );

    it.effect("invalidateAll drops every entry", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        yield* Cache.set(cache.modelListCache, "p1::models::x", "data1");
        yield* Cache.set(cache.capabilityCache, "p1::capability::y", "data2");

        yield* cache.invalidateAll();

        const x = yield* Cache.hit(cache.modelListCache, "p1::models::x");
        const y = yield* Cache.hit(cache.capabilityCache, "p1::capability::y");
        assert.isTrue(x === undefined);
        assert.isTrue(y === undefined);
      }).pipe(Effect.scoped),
    );
  });

  describe("getModelList", () => {
    it.effect("returns cached value on hit without calling fetch", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        let fetchCalls = 0;
        const fetch = () =>
          Effect.sync(() => {
            fetchCalls++;
            return { models: ["claude-3"] };
          });

        // First call — cache miss, fetch is invoked
        const result1 = yield* getModelList(
          cache.modelListCache,
          "provider-x",
          "default",
          fetch,
        );
        assert.deepEqual(result1, { models: ["claude-3"] });
        assert.equal(fetchCalls, 1);

        // Second call — cache hit, fetch not invoked
        const result2 = yield* getModelList(
          cache.modelListCache,
          "provider-x",
          "default",
          fetch,
        );
        assert.deepEqual(result2, { models: ["claude-3"] });
        assert.equal(fetchCalls, 1); // still 1
      }).pipe(Effect.scoped),
    );

    it.effect("increments miss counter on cache miss", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("value"),
        );
        const snapshots = yield* Metric.snapshot;
        assert.isTrue(
          hasCounterSnapshot(snapshots, "t3_provider_cache_misses_total", 1),
        );
      }).pipe(Effect.scoped),
    );

    it.effect("increments hit counter on cache hit", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("value"),
        );
        // prime the cache
        yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("other"),
        );
        const snapshots = yield* Metric.snapshot;
        // miss on first call + hit on second
        assert.isTrue(
          hasCounterSnapshot(snapshots, "t3_provider_cache_misses_total", 1),
        );
        assert.isTrue(
          hasCounterSnapshot(snapshots, "t3_provider_cache_hits_total", 1),
        );
      }).pipe(Effect.scoped),
    );

    it.effect("uses distinct keys per (providerId, modelListKey) tuple", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        let callCount = 0;
        const makeFetch = (v: string) => () =>
          Effect.sync(() => {
            callCount++;
            return v;
          });

        yield* getModelList(cache.modelListCache, "p1", "list-a", makeFetch("v1"));
        yield* getModelList(cache.modelListCache, "p1", "list-b", makeFetch("v2"));
        yield* getModelList(cache.modelListCache, "p2", "list-a", makeFetch("v3"));

        assert.equal(callCount, 3);

        const r1 = yield* getModelList(cache.modelListCache, "p1", "list-a", makeFetch("!"));
        const r2 = yield* getModelList(cache.modelListCache, "p1", "list-b", makeFetch("!"));
        const r3 = yield* getModelList(cache.modelListCache, "p2", "list-a", makeFetch("!"));
        assert.equal(r1, "v1");
        assert.equal(r2, "v2");
        assert.equal(r3, "v3");
        assert.equal(callCount, 3); // no new calls
      }).pipe(Effect.scoped),
    );
  });

  describe("getCapability", () => {
    it.effect("returns cached value on hit", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});
        let calls = 0;
        const fetch = () =>
          Effect.sync(() => {
            calls++;
            return { streaming: true };
          });

        const r1 = yield* getCapability(
          cache.capabilityCache,
          "c1",
          "cap1",
          fetch,
        );
        const r2 = yield* getCapability(
          cache.capabilityCache,
          "c1",
          "cap1",
          fetch,
        );

        assert.deepEqual(r1, { streaming: true });
        assert.deepEqual(r2, { streaming: true });
        assert.equal(calls, 1);
      }).pipe(Effect.scoped),
    );
  });

  describe("TTL expiry", () => {
    it.effect("model list cache respects configured TTL", () =>
      Effect.gen(function* () {
        // 1-second TTL for this test
        const cache = yield* makeProviderCache({
          modelListTtlSeconds: 1,
        });

        yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("fresh"),
        );
        // Still cached immediately
        const before = yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("stale"),
        );
        assert.equal(before, "fresh");

        // Advance clock past TTL
        yield* TestClock.adjust(Duration.seconds(2));

        // Now should be a miss and call fetch again
        const after = yield* getModelList(cache.modelListCache, "p1", "k", () =>
          Effect.succeed("re-fetched"),
        );
        assert.equal(after, "re-fetched");
      }).pipe(Effect.scoped, TestClock.withDefault),
    );

    it.effect("capability cache respects configured TTL", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({
          capabilityTtlSeconds: 1,
        });

        yield* getCapability(cache.capabilityCache, "p1", "cap", () =>
          Effect.succeed("cap-value"),
        );

        yield* TestClock.adjust(Duration.seconds(2));

        const result = yield* getCapability(cache.capabilityCache, "p1", "cap", () =>
          Effect.succeed("re-fetched-cap"),
        );
        assert.equal(result, "re-fetched-cap");
      }).pipe(Effect.scoped, TestClock.withDefault),
    );
  });

  describe("concurrent deduplication", () => {
    it.effect("only calls fetch once for concurrent requests for the same key", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({});

        let activeCalls = 0;
        let totalCalls = 0;
        const slowFetch = () =>
          Effect.gen(function* () {
            activeCalls++;
            totalCalls++;
            yield* Effect.sleep(Duration.millis(50));
            activeCalls--;
            return "done";
          });

        // Fire 5 concurrent lookups for the same key
        const results = yield* Effect.all(
          Array.from({ length: 5 }, () =>
            getModelList(cache.modelListCache, "p1", "same-key", slowFetch),
          ),
          { concurrency: "unbounded" },
        );

        // All should return "done"
        assert.isTrue(results.every((r) => r === "done"));
        // Fetch should have been called exactly once
        assert.equal(totalCalls, 1);
        assert.equal(activeCalls, 0);
      }).pipe(Effect.scoped, Effect.withRequestBatching(true)),
    );
  });

  describe("cache size bounded by maxEntries", () => {
    it.effect("evicts oldest entries when capacity is exceeded", () =>
      Effect.gen(function* () {
        const cache = yield* makeProviderCache({ maxEntries: 3 });

        for (let i = 0; i < 5; i++) {
          yield* Cache.set(
            cache.modelListCache,
            `p1::models::key-${i}`,
            `value-${i}`,
          );
        }

        // Keys 0 and 1 should have been evicted
        const k0 = yield* Cache.hit(cache.modelListCache, "p1::models::key-0");
        const k2 = yield* Cache.hit(cache.modelListCache, "p1::models::key-2");
        assert.isTrue(k0 === undefined);
        assert.isTrue(k2 !== undefined);
      }).pipe(Effect.scoped),
    );
  });
});
