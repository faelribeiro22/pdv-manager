-- Fix: Auto-create owner membership when an establishment is created.
-- This resolves the chicken-and-egg problem where the RLS policy on
-- establishment_members required existing admin membership to INSERT,
-- but the first membership could never be created.

-- 1. Trigger to auto-create owner membership
create or replace function public.handle_new_establishment()
returns trigger language plpgsql security definer as $$
begin
  if new.owner_id is not null then
    insert into public.establishment_members (establishment_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (establishment_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_establishment_created
  after insert on public.establishments
  for each row execute function public.handle_new_establishment();

-- 2. Fix RLS policies on establishment_members:
--    Replace the catch-all "for all" policy with specific per-operation policies
--    so that the establishment owner can always insert members.
drop policy if exists "Admins can manage members" on public.establishment_members;

create policy "Admins can manage members" on public.establishment_members
  for update using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Admins can delete members" on public.establishment_members
  for delete using (public.is_admin_of(establishment_id) or public.is_super_admin());

create policy "Admins or owners can insert members" on public.establishment_members
  for insert with check (
    public.is_admin_of(establishment_id)
    or exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
    or public.is_super_admin()
  );

-- 3. Backfill: Create missing owner memberships for existing establishments
insert into public.establishment_members (establishment_id, user_id, role)
select e.id, e.owner_id, 'owner'
from public.establishments e
where e.owner_id is not null
  and not exists (
    select 1 from public.establishment_members em
    where em.establishment_id = e.id and em.user_id = e.owner_id
  )
on conflict (establishment_id, user_id) do nothing;
