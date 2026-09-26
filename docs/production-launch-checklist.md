# Salonny production launch checklist

This checklist is the release gate for the marketplace. Payments are deliberately out of scope for the current release; bookings use pay-at-business only.

## Automated gate

- `pnpm audit --prod` reports no known production dependency vulnerabilities.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass.
- `pnpm test:e2e` passes its desktop and mobile scenarios (environment-specific scenarios may be explicitly skipped).
- Run `PERF_TEST_URL=https://staging.example.com pnpm test:browser-performance` against the deployed candidate.
- Run `LOAD_TEST_URL=https://staging.example.com LOAD_TEST_REQUESTS=5000 LOAD_TEST_CONCURRENCY=100 pnpm test:load` from an approved load-test source.
- Do not run load tests against production without an agreed traffic window and provider limits.

## Required infrastructure gate

- Supabase is active and its TLS certificate chain is trusted from the deployment region.
- All migrations through `202609260024_marketplace_query_indexes.sql` are applied in order.
- Supabase PITR or daily backups are enabled and a restore drill has been recorded.
- `NEXT_PUBLIC_APP_URL` is the final HTTPS origin; Supabase Auth redirect URLs contain the same origin.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured for distributed rate limiting.
- `CRON_SECRET` is configured before the communication worker endpoint is scheduled.
- `LOG_DRAIN_URL` and `LOG_DRAIN_TOKEN` point to the production alerting destination.
- Secrets exist only in the deployment secret store, never in Git or client-prefixed variables.

## Release verification

- `/api/health/live` returns `200`.
- `/api/health/ready` returns `200` and reports both database and distributed rate limiting as `ok`.
- A new customer can sign up, verify email, sign in, inspect public availability, create a pay-at-business booking, reschedule it, and cancel it according to policy.
- A business owner can complete onboarding, publish a business, configure a branch/service/employee schedule, and see the listing publicly.
- Admin moderation and tenant isolation are verified with separate customer, business, and admin accounts.
- Cache revalidation makes a published business change visible within the expected 60-second window.
- Security headers, robots, sitemap, legal pages, account deletion, and mobile navigation are checked on the final domain.

## Controlled rollout

1. Deploy the immutable candidate and run the automated gate against staging.
2. Enable production traffic gradually (for example 5%, 25%, then 100%).
3. At each step watch 5xx rate, booking conflicts, authentication failures, database connections, p95 latency, web vitals, queue failures, and rate-limit availability.
4. Roll back if readiness fails, error rate rises materially, or booking correctness is uncertain. Preserve database migrations and use a forward fix for schema changes.

## Capacity interpretation

Local concurrency tests validate application behavior and regression thresholds; they do not prove a specific global user count. Production capacity also depends on the hosting plan, CDN hit ratio, Supabase connection and compute limits, Redis limits, regional latency, and real query distribution. Re-run the same scenarios in staging with production-equivalent infrastructure before claiming a traffic ceiling.
