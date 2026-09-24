-- Run once in Supabase SQL Editor before importing the classified workbook.

alter table public.sets
  add column if not exists set_category text not null default '未分類';

alter table public.sets
  add column if not exists set_section text not null default '其他';

comment on column public.sets.set_category is 'Card set category, for example 本家、合作、詩姬';
comment on column public.sets.set_section is 'Card set section, for example 預組、補充';
