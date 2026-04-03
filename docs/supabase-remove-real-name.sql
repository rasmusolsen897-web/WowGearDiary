begin;

update public.characters
set real_name = null
where real_name is not null;

alter table public.characters
drop column if exists real_name;

commit;
