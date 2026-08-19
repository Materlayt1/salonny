-- Anonymous marketplace reads must never evaluate tenant membership helpers.
-- Separate policies also reduce RLS work for public high-traffic pages.

drop policy if exists businesses_public_read on public.businesses;
create policy businesses_anon_read on public.businesses for select to anon using (status = 'published');
create policy businesses_authenticated_read on public.businesses for select to authenticated using (status = 'published' or public.is_business_member(id));

drop policy if exists branches_public_read on public.branches;
create policy branches_anon_read on public.branches for select to anon using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy branches_authenticated_read on public.branches for select to authenticated using ((active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published')) or public.is_business_member(business_id));

drop policy if exists locations_public_read on public.business_locations;
create policy locations_anon_read on public.business_locations for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy locations_authenticated_read on public.business_locations for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));

drop policy if exists images_public_read on public.business_images;
create policy images_anon_read on public.business_images for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy images_authenticated_read on public.business_images for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));

drop policy if exists hours_public_read on public.business_hours;
create policy hours_anon_read on public.business_hours for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy hours_authenticated_read on public.business_hours for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));

drop policy if exists breaks_public_read on public.business_breaks;
create policy breaks_anon_read on public.business_breaks for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy breaks_authenticated_read on public.business_breaks for select to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));

drop policy if exists service_categories_public_read on public.service_categories;
create policy service_categories_anon_read on public.service_categories for select to anon using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy service_categories_authenticated_read on public.service_categories for select to authenticated using (active or public.is_business_member(business_id));

drop policy if exists services_public_read on public.services;
create policy services_anon_read on public.services for select to anon using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy services_authenticated_read on public.services for select to authenticated using ((active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published')) or public.is_business_member(business_id));

drop policy if exists employees_public_read on public.employees;
create policy employees_anon_read on public.employees for select to anon using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy employees_authenticated_read on public.employees for select to authenticated using ((active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published')) or public.is_business_member(business_id));

drop policy if exists branch_services_public_read on public.branch_services;
create policy branch_services_anon_read on public.branch_services for select to anon using (exists (select 1 from public.services s join public.businesses b on b.id = s.business_id where s.id = service_id and s.active and b.status = 'published'));
create policy branch_services_authenticated_read on public.branch_services for select to authenticated using (exists (select 1 from public.services s where s.id = service_id and (s.active or public.is_business_member(s.business_id))));

drop policy if exists employee_branches_public_read on public.employee_branches;
create policy employee_branches_anon_read on public.employee_branches for select to anon using (exists (select 1 from public.employees e join public.businesses b on b.id = e.business_id where e.id = employee_id and e.active and b.status = 'published'));
create policy employee_branches_authenticated_read on public.employee_branches for select to authenticated using (exists (select 1 from public.employees e where e.id = employee_id and (e.active or public.is_business_member(e.business_id))));

drop policy if exists employee_services_public_read on public.employee_services;
create policy employee_services_anon_read on public.employee_services for select to anon using (exists (select 1 from public.employees e join public.businesses b on b.id = e.business_id where e.id = employee_id and e.active and b.status = 'published'));
create policy employee_services_authenticated_read on public.employee_services for select to authenticated using (exists (select 1 from public.employees e where e.id = employee_id and (e.active or public.is_business_member(e.business_id))));

drop policy if exists employee_hours_public_read on public.employee_working_hours;
create policy employee_hours_anon_read on public.employee_working_hours for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy employee_hours_authenticated_read on public.employee_working_hours for select to authenticated using (public.is_business_member(business_id) or exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_anon_read on public.reviews for select to anon using (moderation_status = 'approved');
create policy reviews_authenticated_read on public.reviews for select to authenticated using (moderation_status = 'approved' or customer_user_id = auth.uid() or public.is_business_member(business_id));

