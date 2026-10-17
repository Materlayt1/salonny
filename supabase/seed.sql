-- Base category taxonomy for local and preview environments.
insert into public.business_categories (slug, name_tr, icon, sort_order) values
  ('kuafor', 'Kuaför', 'scissors', 10), ('berber', 'Berber', 'razor', 20),
  ('guzellik', 'Güzellik', 'sparkles', 30), ('nail', 'Nail', 'hand', 40),
  ('spa', 'Spa', 'flower', 50), ('veteriner', 'Veteriner', 'paw', 60),
  ('pet-kuaforu', 'Pet Kuaförü', 'dog', 70), ('fitness', 'Fitness', 'dumbbell', 80),
  ('pilates', 'Pilates', 'activity', 90), ('diger', 'Diğer', 'ellipsis', 100)
on conflict (slug) do update set name_tr = excluded.name_tr, sort_order = excluded.sort_order;
