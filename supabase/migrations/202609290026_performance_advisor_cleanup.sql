-- Keep public/member SELECT policies separate from write policies. An ALL
-- policy also applies to SELECT and forces Postgres to evaluate both
-- permissive branches for every read.

drop policy if exists member_permissions_manage on public.business_member_permissions;
drop policy if exists member_permissions_manage_insert on public.business_member_permissions;
drop policy if exists member_permissions_manage_update on public.business_member_permissions;
drop policy if exists member_permissions_manage_delete on public.business_member_permissions;
create policy member_permissions_manage_insert on public.business_member_permissions
  for insert to authenticated
  with check (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));
create policy member_permissions_manage_update on public.business_member_permissions
  for update to authenticated
  using (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]))
  with check (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));
create policy member_permissions_manage_delete on public.business_member_permissions
  for delete to authenticated
  using (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));

drop policy if exists resources_manage on public.business_resources;
drop policy if exists resources_manage_insert on public.business_resources;
drop policy if exists resources_manage_update on public.business_resources;
drop policy if exists resources_manage_delete on public.business_resources;
create policy resources_manage_insert on public.business_resources
  for insert to authenticated
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy resources_manage_update on public.business_resources
  for update to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]))
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy resources_manage_delete on public.business_resources
  for delete to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

drop policy if exists packages_manage on public.service_packages;
drop policy if exists packages_manage_insert on public.service_packages;
drop policy if exists packages_manage_update on public.service_packages;
drop policy if exists packages_manage_delete on public.service_packages;
create policy packages_manage_insert on public.service_packages
  for insert to authenticated
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy packages_manage_update on public.service_packages
  for update to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]))
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy packages_manage_delete on public.service_packages
  for delete to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

drop policy if exists service_resources_manage on public.service_resources;
drop policy if exists service_resources_manage_insert on public.service_resources;
drop policy if exists service_resources_manage_update on public.service_resources;
drop policy if exists service_resources_manage_delete on public.service_resources;
create policy service_resources_manage_insert on public.service_resources
  for insert to authenticated
  with check (exists (
    select 1 from public.business_resources resource
    where resource.id = resource_id
      and public.has_business_role(resource.business_id, array['OWNER','MANAGER']::public.business_member_role[])
  ));
create policy service_resources_manage_update on public.service_resources
  for update to authenticated
  using (exists (
    select 1 from public.business_resources resource
    where resource.id = resource_id
      and public.has_business_role(resource.business_id, array['OWNER','MANAGER']::public.business_member_role[])
  ))
  with check (exists (
    select 1 from public.business_resources resource
    where resource.id = resource_id
      and public.has_business_role(resource.business_id, array['OWNER','MANAGER']::public.business_member_role[])
  ));
create policy service_resources_manage_delete on public.service_resources
  for delete to authenticated
  using (exists (
    select 1 from public.business_resources resource
    where resource.id = resource_id
      and public.has_business_role(resource.business_id, array['OWNER','MANAGER']::public.business_member_role[])
  ));

-- Identical to the original foundation index; retain the older canonical name.
drop index if exists public.reviews_public_recent_idx;
