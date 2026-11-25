-- Private photo storage (only approved family members can see photos)
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists "pw photos read" on storage.objects;
drop policy if exists "pw photos write" on storage.objects;
drop policy if exists "pw photos delete" on storage.objects;
create policy "pw photos read" on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_member());
create policy "pw photos write" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.can('add'));
create policy "pw photos delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.can('add'));
