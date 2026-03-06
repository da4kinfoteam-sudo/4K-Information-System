create table if not exists budget_ceilings (
  "id" bigint primary key generated always as identity,
  "operating_unit" text not null,
  "year" integer not null,
  "amount" numeric not null default 0,
  "created_at" timestamptz default now(),
  "updated_at" timestamptz default now(),
  unique("operating_unit", "year")
);
