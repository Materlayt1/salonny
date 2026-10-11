export type RedisRestEnvironment = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
};

export type RedisRestConfig = {
  url: string;
  token: string;
} & (
  | { family: "upstash"; urlName: "UPSTASH_REDIS_REST_URL"; tokenName: "UPSTASH_REDIS_REST_TOKEN" }
  | { family: "kv"; urlName: "KV_REST_API_URL"; tokenName: "KV_REST_API_TOKEN" }
);

export function resolveRedisRestConfig(environment?: RedisRestEnvironment): RedisRestConfig | null;
