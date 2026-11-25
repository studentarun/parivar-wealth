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
