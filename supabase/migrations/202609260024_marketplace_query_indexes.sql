-- Indexes for the public directory's real query shapes. They keep contains
-- search, city/category filtering and bounded card payloads responsive as the
-- marketplace grows beyond the first few thousand published businesses.

create extension if not exists pg_trgm with schema extensions;

create index if not exists businesses_published_name_trgm_idx
  on public.businesses using gin (name gin_trgm_ops)
  where status = 'published';

create index if not exists business_locations_business_city_idx
  on public.business_locations (business_id, lower(city));

create index if not exists business_locations_city_trgm_idx
  on public.business_locations using gin (city gin_trgm_ops);

create index if not exists services_public_card_idx
  on public.services (business_id, price_minor, id)
  where active;

create index if not exists reviews_public_recent_idx
  on public.reviews (business_id, created_at desc)
  where moderation_status = 'approved';
