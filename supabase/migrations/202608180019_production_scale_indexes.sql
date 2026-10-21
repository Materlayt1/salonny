-- Composite and partial indexes for the public marketplace, tenant context and
-- real-time booking paths. Create these before production traffic is enabled.

create index if not exists businesses_published_rating_idx
  on public.businesses (rating_average desc, created_at desc)
  where status = 'published';

create index if not exists businesses_published_updated_idx
  on public.businesses (updated_at desc)
  where status = 'published';

create index if not exists business_categories_active_sort_idx
  on public.business_categories (sort_order, slug)
  where active;

create index if not exists business_members_user_active_created_idx
  on public.business_members (user_id, created_at)
  where active;

create index if not exists branches_business_primary_active_idx
  on public.branches (business_id, is_primary desc, created_at)
  where active;

create index if not exists business_images_business_kind_sort_idx
  on public.business_images (business_id, kind, sort_order);

create index if not exists business_hours_branch_weekday_idx
  on public.business_hours (branch_id, weekday);

create index if not exists appointments_employee_active_start_idx
  on public.appointments (employee_id, starts_at, ends_at)
  where status in ('pending', 'confirmed');

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
