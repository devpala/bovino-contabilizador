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

create table if not exists information_animals (
  id bigserial primary key,
  establishment_id bigint not null references establishments(id) on delete cascade,
  animal_id bigint references animals(id) on delete cascade,
  section_key text not null,
  year integer not null check (year >= 2000 and year <= 2100),
  animal_type text not null,
  description text not null,
  created_at timestamptz not null default now(),
  check (section_key in ('prenadas', 'vacasViejas', 'nacimientos')),
  check (animal_type in ('vaca', 'ternero', 'toro'))
);

alter table information_animals
  add column if not exists animal_id bigint references animals(id) on delete cascade;

create index if not exists information_animals_establishment_section_year_idx
  on information_animals (establishment_id, section_key, year);

create index if not exists information_animals_establishment_created_at_idx
  on information_animals (establishment_id, created_at desc);

create unique index if not exists information_animals_unique_animal_section_year_idx
  on information_animals (animal_id, section_key, year)
  where animal_id is not null;

create table if not exists animals (
  id bigserial primary key,
  establishment_id bigint not null references establishments(id) on delete cascade,
  category_key text not null,
  identifier text not null,
  description text not null default '',
  age_months integer,
  status text not null default '',
  observations text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category_key in ('vacas', 'toros', 'novillitos', 'vaquillonas', 'terneras', 'terneros')),
  check (age_months is null or age_months >= 0),
  unique (establishment_id, category_key, identifier)
);

create table if not exists animal_images (
  id bigserial primary key,
  animal_id bigint not null references animals(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists animals_establishment_category_idx
  on animals (establishment_id, category_key, created_at desc);

create index if not exists animal_images_animal_idx
  on animal_images (animal_id, created_at desc);
