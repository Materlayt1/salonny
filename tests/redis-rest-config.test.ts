import { describe, expect, it } from "vitest";
import { resolveRedisRestConfig } from "@/lib/redis-rest-config.mjs";

const kv = { KV_REST_API_URL: "https://kv-fixture.example/", KV_REST_API_TOKEN: "kv-fixture-write-token" };
const upstash = { UPSTASH_REDIS_REST_URL: "https://upstash-fixture.example/", UPSTASH_REDIS_REST_TOKEN: "upstash-fixture-token" };

describe("Redis REST family selection", () => {
  it("prefers a complete canonical Upstash pair over KV", () => {
    expect(resolveRedisRestConfig({ ...kv, ...upstash })).toEqual({
      url: "https://upstash-fixture.example", token: "upstash-fixture-token",
      urlName: "UPSTASH_REDIS_REST_URL", tokenName: "UPSTASH_REDIS_REST_TOKEN", family: "upstash",
    });
  });
  it("supports a complete writable native integration pair", () => {
    expect(resolveRedisRestConfig(kv)).toEqual({
      url: "https://kv-fixture.example", token: "kv-fixture-write-token",
      urlName: "KV_REST_API_URL", tokenName: "KV_REST_API_TOKEN", family: "kv",
    });
  });
  it("trims values and treats whitespace-only canonical values as unset", () => {
    expect(resolveRedisRestConfig({ UPSTASH_REDIS_REST_URL: "  ", UPSTASH_REDIS_REST_TOKEN: " \n ", KV_REST_API_URL: " https://kv-fixture.example/ ", KV_REST_API_TOKEN: " kv-token " })).toMatchObject({ family: "kv", url: "https://kv-fixture.example", token: "kv-token" });
  });
  it.each([
    { UPSTASH_REDIS_REST_URL: upstash.UPSTASH_REDIS_REST_URL },
    { UPSTASH_REDIS_REST_TOKEN: upstash.UPSTASH_REDIS_REST_TOKEN },
  ])("does not fall back when canonical configuration is partial: %j", (partial) => {
    expect(resolveRedisRestConfig({ ...kv, ...partial })).toBeNull();
  });
  it.each([
    {}, { KV_REST_API_URL: kv.KV_REST_API_URL }, { KV_REST_API_TOKEN: kv.KV_REST_API_TOKEN },
    { UPSTASH_REDIS_REST_URL: upstash.UPSTASH_REDIS_REST_URL, KV_REST_API_TOKEN: kv.KV_REST_API_TOKEN },
    { KV_REST_API_URL: kv.KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN: upstash.UPSTASH_REDIS_REST_TOKEN },
  ])("rejects missing and mixed credential pairs: %j", (environment) => {
    expect(resolveRedisRestConfig(environment)).toBeNull();
  });
  it("ignores read-only or native Redis URL alternatives", () => {
    const environment = { KV_REST_API_URL: kv.KV_REST_API_URL, KV_REST_API_READ_ONLY_TOKEN: "read-only-fixture", KV_URL: "redis://fixture", KV_REDIS_URL: "redis://fixture" };
    expect(resolveRedisRestConfig(environment)).toBeNull();
  });
  it.each([
    "http://redis-fixture.example", "not-a-url", "https://", "https:redis-fixture.example",
    "https://fixture-user:fixture-password@redis-fixture.example", "https://fixture-user@redis-fixture.example",
    "https://redis-fixture.example?credential=fixture", "https://redis-fixture.example#fixture",
    "https://redis-fixture.example?", "https://redis-fixture.example#", "https://redis-fixture.\nexample",
  ])("rejects an invalid KV REST URL without returning credentials: %s", (url) => {
    expect(resolveRedisRestConfig({ ...kv, KV_REST_API_URL: url })).toBeNull();
  });
  it.each(["http://preferred.example", "malformed", "https://user:password@preferred.example", "https://preferred.example?fixture=1", "https://preferred.example#fixture"])("does not fall back to KV when the complete preferred URL is invalid: %s", (url) => {
    expect(resolveRedisRestConfig({ ...kv, ...upstash, UPSTASH_REDIS_REST_URL: url })).toBeNull();
  });
});
