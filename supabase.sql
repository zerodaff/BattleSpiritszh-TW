-- Battle Spirits card browser schema for Supabase

create extension if not exists pgcrypto;

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  set_code text not null references public.sets(code) on update cascade on delete restrict,
  card_number text not null unique,
  rarity text not null default '',
  cost integer not null default 0,
  card_name text not null default '',
  type text not null default '',
  system text not null default '',
  suffix text not null default '',
  effect text not null default '',
  color text not null default '',
  image_url text not null default '',
  source text not null default 'bandai',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cards_set_code on public.cards(set_code);
create index if not exists idx_cards_color on public.cards(color);
create index if not exists idx_cards_rarity on public.cards(rarity);
create index if not exists idx_cards_cost on public.cards(cost);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '我的牌組',
  description text not null default '',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (deck_id, card_id)
);

create table if not exists public.site_visitors (
  visitor_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_visit_date date not null default current_date
);

alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.site_visitors enable row level security;

drop policy if exists "public read sets" on public.sets;
create policy "public read sets" on public.sets
for select using (true);

drop policy if exists "public read cards" on public.cards;
create policy "public read cards" on public.cards
for select using (is_active = true);

drop policy if exists "admin read site visitors" on public.site_visitors;
create policy "admin read site visitors" on public.site_visitors
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "admin manage cards" on public.cards;
create policy "admin manage cards" on public.cards
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
for update using (auth.uid() = id);

create policy "admin read profiles" on public.profiles
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "own decks read" on public.decks;
create policy "own decks read" on public.decks
for select using (auth.uid() = user_id);

drop policy if exists "own decks insert" on public.decks;
create policy "own decks insert" on public.decks
for insert with check (auth.uid() = user_id);

drop policy if exists "own decks update" on public.decks;
create policy "own decks update" on public.decks
for update using (auth.uid() = user_id);

drop policy if exists "own decks delete" on public.decks;
create policy "own decks delete" on public.decks
for delete using (auth.uid() = user_id);

create policy "admin manage decks" on public.decks
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "own deck cards read" on public.deck_cards;
create policy "own deck cards read" on public.deck_cards
for select using (
  exists (
    select 1 from public.decks d
    where d.id = deck_id and d.user_id = auth.uid()
  )
);

drop policy if exists "own deck cards write" on public.deck_cards;
create policy "own deck cards write" on public.deck_cards
for all using (
  exists (
    select 1 from public.decks d
    where d.id = deck_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.decks d
    where d.id = deck_id and d.user_id = auth.uid()
  )
);

create policy "admin manage deck cards" on public.deck_cards
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "admin manage sets" on public.sets;
create policy "admin manage sets" on public.sets
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sets_updated_at on public.sets;
create trigger trg_sets_updated_at
before update on public.sets
for each row execute function public.set_updated_at();

drop trigger if exists trg_cards_updated_at on public.cards;
create trigger trg_cards_updated_at
before update on public.cards
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_decks_updated_at on public.decks;
create trigger trg_decks_updated_at
before update on public.decks
for each row execute function public.set_updated_at();

drop trigger if exists trg_deck_cards_updated_at on public.deck_cards;
create trigger trg_deck_cards_updated_at
before update on public.deck_cards
for each row execute function public.set_updated_at();

create or replace function public.register_site_visit(p_visitor_id text)
returns table(total_visitors bigint, today_visitors bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_visitors (visitor_id, first_seen, last_seen, last_visit_date)
  values (p_visitor_id, now(), now(), current_date)
  on conflict (visitor_id)
  do update set
    last_seen = now(),
    last_visit_date = current_date;

  return query
  select
    (select count(*) from public.site_visitors)::bigint as total_visitors,
    (select count(*) from public.site_visitors where last_visit_date = current_date)::bigint as today_visitors;
end;
$$;

grant execute on function public.register_site_visit(text) to anon, authenticated;

insert into public.sets (code, name, sort_order)
values
  ('26RBS01', 'Battle Spirits 26RBS01', 1),
  ('26RCB01', 'Battle Spirits 26RCB01', 2)
on conflict (code) do nothing;
