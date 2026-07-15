drop function if exists public.register_site_visit(text);
drop function if exists public.register_site_visit();

drop table if exists public.site_visitors;

create table public.site_visitors (
  id bigserial primary key,
  page_url text not null default 'https://zerodaff.github.io/BattleSpiritszh-TW/',
  visited_at timestamptz not null default now(),
  visit_date date not null default ((now() at time zone 'Asia/Taipei')::date)
);

alter table public.site_visitors enable row level security;

drop policy if exists "admin read site visitors" on public.site_visitors;
create policy "admin read site visitors" on public.site_visitors
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create or replace function public.register_site_visit()
returns table(total_visitors bigint, today_visitors bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public.site_visitors (page_url, visited_at, visit_date)
  values ('https://zerodaff.github.io/BattleSpiritszh-TW/', now(), taipei_today);

  return query
  select
    (select count(*) from public.site_visitors)::bigint as total_visitors,
    (select count(*) from public.site_visitors where visit_date = taipei_today)::bigint as today_visitors;
end;
$$;

grant execute on function public.register_site_visit() to anon, authenticated;
