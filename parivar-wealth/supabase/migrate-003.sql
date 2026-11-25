-- Parivar Wealth migration 003: other assets (FD, gold, property, EPF…) + photo storage
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid references holders(id) on delete set null,
  type text not null,
  name text not null,
  details jsonb not null default '{}',
  value_override numeric,
  photos text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table assets enable row level security;
drop policy if exists assets_r on assets;
drop policy if exists assets_i on assets;
drop policy if exists assets_u on assets;
drop policy if exists assets_d on assets;
create policy assets_r on assets for select using (is_member() and (holder_id is null or can_see(holder_id)));
create policy assets_i on assets for insert with check (can('add') and (holder_id is null or can_see(holder_id)));
create policy assets_u on assets for update using (can('add') and (holder_id is null or can_see(holder_id)));
create policy assets_d on assets for delete using (can('delete') and (holder_id is null or can_see(holder_id)));
drop trigger if exists audit_assets on assets;
create trigger audit_assets after insert or update or delete on assets for each row execute function audit();
grant select, insert, update, delete on assets to authenticated;
grant all on assets to service_role;
