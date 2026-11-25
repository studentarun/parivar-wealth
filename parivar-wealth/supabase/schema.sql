-- Parivar Wealth — database schema (run once in Supabase → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

create extension if not exists pgcrypto;

-- ───────────── tables ─────────────
create table if not exists holders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relation text,
  other_income numeric not null default 0,
  clubbed_with uuid references holders(id) on delete set null,
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists instruments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('MF','STOCK','ETF')),
  code text not null,
  name text not null,
  tax_class text not null default 'equity',
  category text not null default 'Other',
  exit_load_pct numeric not null default 0,
  exit_load_days int not null default 0,
  keep boolean not null default true,
  unique (kind, code)
);

create table if not exists sips (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references holders(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  amount numeric not null,
  day int not null check (day between 1 and 31),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  last_run_date date,
  created_at timestamptz default now()
);

create table if not exists txns (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references holders(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  date date not null,
  type text not null check (type in ('BUY','SELL')),
  units numeric,
  price numeric,
  amount numeric,
  status text not null default 'done' check (status in ('done','pending')),
  source text not null default 'manual',
  sip_id uuid references sips(id) on delete set null,
  after_cutoff boolean default false,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists txns_holder_idx on txns(holder_id);

create table if not exists prices (
  key text not null,
  date date not null,
  price numeric not null,
  primary key (key, date)
);

create table if not exists amfi_schemes (
  code text primary key,
  name text not null,
  nav numeric,
  nav_date date
);

create table if not exists nse_symbols (
  symbol text primary key,
  name text,
  close numeric,
  date date
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'pending' check (role in ('admin','member','pending')),
  perms jsonb not null default '{"add":false,"withdraw":false,"delete":false,"settings":false,"holders":[]}',
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz default now(),
  user_id uuid,
  email text,
  action text,
  tbl text,
  row_id text,
  details jsonb
);

create or replace view latest_prices with (security_invoker = true) as
  select distinct on (key) key, date, price from prices order by key, date desc;

-- ───────────── permission helpers ─────────────
create or replace function me() returns app_users
language sql stable security definer set search_path = public as
$$ select * from app_users where user_id = auth.uid() $$;

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('admin','member') from app_users where user_id = auth.uid()), false) $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' from app_users where user_id = auth.uid()), false) $$;

create or replace function can(p text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' or (role = 'member' and coalesce((perms->>p)::boolean, false))
                    from app_users where user_id = auth.uid()), false) $$;

create or replace function can_see(h uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' or (role = 'member' and (jsonb_array_length(coalesce(perms->'holders','[]'::jsonb)) = 0
                                                   or perms->'holders' ? h::text))
                    from app_users where user_id = auth.uid()), false) $$;

-- First person to sign up becomes admin; everyone after waits for approval.
create or replace function register_me(p_name text) returns app_users
language plpgsql security definer set search_path = public as $$
declare r app_users;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from app_users where user_id = auth.uid();
  if found then return r; end if;
  insert into app_users(user_id, email, display_name, role, perms)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_name,
          case when exists (select 1 from app_users) then 'pending' else 'admin' end,
          case when exists (select 1 from app_users)
               then '{"add":false,"withdraw":false,"delete":false,"settings":false,"holders":[]}'::jsonb
               else '{"add":true,"withdraw":true,"delete":true,"settings":true,"holders":[]}'::jsonb end)
  returning * into r;
  return r;
end $$;

-- ───────────── audit trail ─────────────
create or replace function audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid text; d jsonb;
begin
  d := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := coalesce(d->>'id', d->>'key', d->>'user_id');
  insert into audit_log(user_id, email, action, tbl, row_id, details)
  values (auth.uid(), coalesce((select email from app_users where user_id = auth.uid()), 'nightly job'),
          tg_op, tg_table_name, rid, d);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['holders','instruments','txns','sips','settings','app_users'] loop
    execute format('drop trigger if exists audit_%1$s on %1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit()', t);
  end loop;
end $$;

-- ───────────── row level security ─────────────
alter table holders enable row level security;
alter table instruments enable row level security;
alter table txns enable row level security;
alter table sips enable row level security;
alter table prices enable row level security;
alter table amfi_schemes enable row level security;
alter table nse_symbols enable row level security;
alter table settings enable row level security;
alter table app_users enable row level security;
alter table audit_log enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

create policy holders_r on holders for select using (is_member() and can_see(id));
create policy holders_w on holders for all using (can('settings')) with check (can('settings'));

create policy inst_r on instruments for select using (is_member());
create policy inst_i on instruments for insert with check (can('add') or can('settings'));
create policy inst_u on instruments for update using (can('settings'));
create policy inst_d on instruments for delete using (can('settings'));

create policy txns_r on txns for select using (is_member() and can_see(holder_id));
create policy txns_i on txns for insert with check (
  can_see(holder_id) and ((type = 'BUY' and can('add')) or (type = 'SELL' and can('withdraw'))));
create policy txns_u on txns for update using (can('settings') or (can('delete') and can_see(holder_id)));
create policy txns_d on txns for delete using (can('delete') and can_see(holder_id));

create policy sips_r on sips for select using (is_member() and can_see(holder_id));
create policy sips_i on sips for insert with check (can('add') and can_see(holder_id));
create policy sips_u on sips for update using (can('add') and can_see(holder_id));
create policy sips_d on sips for delete using (can('delete') and can_see(holder_id));

create policy prices_r on prices for select using (is_member());
create policy prices_w on prices for insert with check (can('settings'));
create policy prices_u on prices for update using (can('settings'));
create policy amfi_r on amfi_schemes for select using (is_member());
create policy nse_r on nse_symbols for select using (is_member());

create policy settings_r on settings for select using (is_member());
create policy settings_w on settings for all using (can('settings')) with check (can('settings'));

create policy users_r on app_users for select using (user_id = auth.uid() or is_admin());
create policy users_u on app_users for update using (is_admin()) with check (is_admin());
create policy users_d on app_users for delete using (is_admin() and user_id <> auth.uid());

create policy audit_r on audit_log for select using (is_admin());

grant select on latest_prices to authenticated;

-- Table privileges (newer Supabase projects don't grant these automatically). RLS above still decides rows.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- Parivar Wealth migration 002: login email per family member, ETF/stock SIP charges, auto-approve by email
alter table holders add column if not exists email text;
alter table holders add column if not exists regime text not null default 'new';
alter table holders add column if not exists age_group text not null default 'below60';
alter table holders add column if not exists income jsonb;
alter table holders add column if not exists income_override boolean not null default false;
alter table sips add column if not exists charges numeric not null default 0;

-- Signing up with an email the admin saved on a family member = instant access to the family view.
create or replace function register_me(p_name text) returns app_users
language plpgsql security definer set search_path = public as $$
declare r app_users; v_email text; v_holder holders;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from app_users where user_id = auth.uid();
  if found then return r; end if;
  v_email := (select lower(email) from auth.users where id = auth.uid());
  select * into v_holder from holders where lower(email) = v_email limit 1;
  insert into app_users(user_id, email, display_name, role, perms)
  values (auth.uid(), v_email, coalesce(v_holder.name, p_name),
          case when not exists (select 1 from app_users) then 'admin'
               when v_holder.id is not null then 'member' else 'pending' end,
          case when not exists (select 1 from app_users)
                 then '{"add":true,"withdraw":true,"delete":true,"settings":true,"holders":[]}'::jsonb
               when v_holder.id is not null
                 then '{"add":true,"withdraw":true,"delete":false,"settings":false,"holders":[]}'::jsonb
               else '{"add":false,"withdraw":false,"delete":false,"settings":false,"holders":[]}'::jsonb end)
  returning * into r;
  return r;
end $$;

-- If someone signed up before the admin saved their email, approve them now.
create or replace function approve_by_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update app_users set role = 'member',
      perms = '{"add":true,"withdraw":true,"delete":false,"settings":false,"holders":[]}'::jsonb,
      display_name = new.name
    where lower(email) = lower(new.email) and role = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists holders_approve on holders;
create trigger holders_approve after insert or update of email on holders for each row execute function approve_by_email();

grant execute on all functions in schema public to authenticated, service_role;
