
-- Existing tables...

-- 7. IPO History (Existing)
create table if not exists ipo_history (
  "id" bigint primary key generated always as identity,
  "ipo_id" bigint not null,
  "event" text not null,
  "user" text,
  "date" timestamptz default now(),
  "created_at" timestamptz default now()
);

-- 8. Subproject Accomplishment History
create table if not exists subproject_accomplishments (
  "id" bigint primary key generated always as identity,
  "subproject_id" bigint not null,
  "detail_id" bigint not null, -- References the ID inside the JSONB array
  "delivery_date" date,
  "quantity" numeric,
  "remarks" text,
  "created_by" text,
  "created_at" timestamptz default now()
);
