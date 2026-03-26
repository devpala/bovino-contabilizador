create table if not exists establishments (
  id bigserial primary key,
  name text not null unique,
  herd_total integer not null default 0 check (herd_total >= 0),
  herd_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists vaccination_records (
  id bigserial primary key,
  location text not null,
  total integer not null check (total >= 0),
  detail jsonb not null,
  created_at timestamptz not null default now()
);

alter table vaccination_records
  add column if not exists establishment_id bigint references establishments(id) on delete cascade;

alter table vaccination_records
  add column if not exists record_type text not null default 'snapshot';

alter table vaccination_records
  add column if not exists movement_type text;

alter table vaccination_records
  add column if not exists movement_category text;

alter table vaccination_records
  add column if not exists movement_to_category text;

alter table vaccination_records
  add column if not exists movement_quantity integer;

insert into establishments (name)
select distinct location
from vaccination_records
where coalesce(trim(location), '') <> ''
on conflict (name) do nothing;

update vaccination_records vr
set establishment_id = e.id
from establishments e
where vr.establishment_id is null
  and vr.location = e.name;

create index if not exists vaccination_records_created_at_idx
  on vaccination_records (created_at desc);

create index if not exists vaccination_records_establishment_created_at_idx
  on vaccination_records (establishment_id, created_at desc);
