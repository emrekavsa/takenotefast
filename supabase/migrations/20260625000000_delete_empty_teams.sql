create or replace function public.delete_empty_team_after_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.teams
  where id = old.team_id
  for update;

  if not exists (
    select 1
    from public.members
    where team_id = old.team_id
  ) then
    delete from public.alerts
    where team_id = old.team_id;

    delete from public.teams
    where id = old.team_id;
  end if;

  return old;
end;
$$;

drop trigger if exists delete_empty_team_after_member_delete on public.members;

create trigger delete_empty_team_after_member_delete
after delete on public.members
for each row
execute function public.delete_empty_team_after_member_delete();

delete from public.alerts
where team_id in (
  select teams.id
  from public.teams
  where not exists (
    select 1
    from public.members
    where members.team_id = teams.id
  )
);

delete from public.teams
where not exists (
  select 1
  from public.members
  where members.team_id = teams.id
);
