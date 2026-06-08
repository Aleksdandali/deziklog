-- TEMPORARY introspection helper for the 2026-06-08 isolation-fix work.
-- Returns storage.objects RLS state + policies, and the table-level grants on
-- public.orders / public.profiles, so the fix migration can target precisely.
-- Dropped again by 20260609000001_fix_isolation_holes.sql.
create or replace function public._sec_introspect()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog, information_schema
stable
as $$
  select jsonb_build_object(
    'storage_objects_rls', (
      select jsonb_build_object('relrowsecurity', relrowsecurity, 'relforcerowsecurity', relforcerowsecurity)
      from pg_class where oid = 'storage.objects'::regclass),
    'storage_policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', policyname, 'cmd', cmd, 'permissive', permissive,
        'roles', roles, 'qual', qual, 'with_check', with_check) order by policyname), '[]'::jsonb)
      from pg_policies where schemaname = 'storage' and tablename = 'objects'),
    'orders_grants', (
      select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'priv', privilege_type)), '[]'::jsonb)
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'orders' and grantee in ('authenticated','anon')),
    'profiles_grants', (
      select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'priv', privilege_type)), '[]'::jsonb)
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'profiles' and grantee in ('authenticated','anon')),
    'orders_col_update_grants', (
      select coalesce(jsonb_agg(distinct column_name), '[]'::jsonb)
      from information_schema.role_column_grants
      where table_schema='public' and table_name='orders' and grantee in ('authenticated','anon') and privilege_type='UPDATE')
  );
$$;
revoke execute on function public._sec_introspect() from public, anon, authenticated;
grant execute on function public._sec_introspect() to service_role;
