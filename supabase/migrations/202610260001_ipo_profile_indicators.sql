-- Additive only: historical records remain NULL; no default, backfill or policy change.
begin;

alter table public.ipos
    add column if not exists "isF2c2Cluster" boolean,
    add column if not exists "isFfedisRegistered" boolean,
    add column if not exists "ffedisRegistrationNumber" text,
    add column if not exists "ffedisRegistrationDate" date;

comment on column public.ipos."isF2c2Cluster" is 'Explicit F2C2 cluster indicator; NULL means not recorded.';
comment on column public.ipos."isFfedisRegistered" is 'Explicit FFEDIS registered indicator; NULL means not recorded.';
comment on column public.ipos."ffedisRegistrationNumber" is 'FFEDIS registration identifier, independent of ordinary IPO registration.';
comment on column public.ipos."ffedisRegistrationDate" is 'FFEDIS date-only registration date, independent of ordinary IPO registration.';

commit;
