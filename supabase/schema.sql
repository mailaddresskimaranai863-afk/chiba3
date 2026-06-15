create table if not exists public.materials (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
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

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
before update on public.materials
for each row
execute function public.set_updated_at();

alter table public.materials enable row level security;

drop policy if exists "Allow anon read materials" on public.materials;
create policy "Allow anon read materials"
on public.materials
for select
to anon
using (true);

drop policy if exists "Allow anon insert materials" on public.materials;
create policy "Allow anon insert materials"
on public.materials
for insert
to anon
with check (true);

drop policy if exists "Allow anon update materials" on public.materials;
create policy "Allow anon update materials"
on public.materials
for update
to anon
using (true)
with check (true);

drop policy if exists "Allow anon delete materials" on public.materials;
create policy "Allow anon delete materials"
on public.materials
for delete
to anon
using (true);
