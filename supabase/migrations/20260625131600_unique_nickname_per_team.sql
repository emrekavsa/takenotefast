-- Enforce unique nicknames within each team
ALTER TABLE public.members
  ADD CONSTRAINT members_team_nickname_unique UNIQUE (team_id, nickname);
