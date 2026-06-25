-- 1. Add title column to alerts
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

-- 2. Add length constraints
ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_title_length CHECK (char_length(title) <= 100);

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_message_length CHECK (char_length(message) <= 500);

-- 3. Backfill: copy first 60 chars of message to title for existing rows
UPDATE public.alerts
  SET title = LEFT(message, 60)
  WHERE title = '' AND message != '';

-- 4. Replace inefficient team_id-only index with composite index
DROP INDEX IF EXISTS idx_alerts_team_id;
CREATE INDEX idx_alerts_team_created ON public.alerts (team_id, created_at DESC);

-- 5. Fix the broken alerts_acknowledge RLS policy
DROP POLICY IF EXISTS alerts_acknowledge ON public.alerts;

CREATE POLICY alerts_acknowledge ON public.alerts
  FOR UPDATE
  USING (true)
  WITH CHECK (
    team_id = (SELECT a.team_id FROM public.alerts a WHERE a.id = alerts.id)
    AND from_nickname = (SELECT a.from_nickname FROM public.alerts a WHERE a.id = alerts.id)
    AND to_target = (SELECT a.to_target FROM public.alerts a WHERE a.id = alerts.id)
    AND message = (SELECT a.message FROM public.alerts a WHERE a.id = alerts.id)
    AND title = (SELECT a.title FROM public.alerts a WHERE a.id = alerts.id)
  );
