-- HIGH (full audit 2026-06-10): the minimum-duration rule — the app's core
-- regulatory promise (Form №257/о) — was enforced only in complete-cycle.tsx.
-- RLS UPDATE policy is a bare `auth.uid() = user_id`, so a user holding their
-- own JWT could PATCH sterilization_sessions directly (or edit the
-- active_timer AsyncStorage blob / device clock) and fabricate a
-- compliant-looking "success" record. Enforce the lifecycle at the DB; the
-- client checks remain as UX.
--
-- Lifecycle (mirrors the app exactly):
--   draft → in_progress → completed (result='success')
--                       → failed    (result='failure')
--                       → canceled
--
-- Rules:
--   * INSERT must start at draft with no timestamps/result (otherwise the
--     UPDATE trigger is trivially bypassed by inserting a finished row).
--   * Server clock is authoritative: client started_at/ended_at are accepted
--     only within a ±10 min window (both transitions happen online), else
--     clamped to now().
--   * duration_minutes/temperature freeze once the cycle leaves draft;
--     started_at freezes while in_progress.
--   * completed requires in_progress AND elapsed >= duration_minutes − 60 s.
--   * terminal records (completed/failed/canceled) are immutable — this is a
--     regulatory journal. (Account deletion uses DELETE, which is unaffected.)

CREATE OR REPLACE FUNCTION public.enforce_cycle_integrity_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.status, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'invalid_insert: sessions must be created as draft, got %', NEW.status;
  END IF;
  NEW.status := 'draft';
  NEW.started_at := NULL;
  NEW.ended_at := NULL;
  NEW.result := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_cycle_integrity_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- 60 s tolerance: the client timer fires on whole minutes; clock skew
  -- between the clamped started_at and completion must not flip an honest
  -- cycle into an error.
  tolerance CONSTANT interval := interval '60 seconds';
  max_drift CONSTANT interval := interval '10 minutes';
BEGIN
  -- Terminal records are immutable.
  IF OLD.status IN ('completed', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'session_locked: % record cannot be modified', OLD.status;
  END IF;

  -- Core cycle parameters are fixed once the cycle leaves draft.
  IF OLD.status <> 'draft' THEN
    NEW.duration_minutes := OLD.duration_minutes;
    NEW.temperature := OLD.temperature;
  END IF;

  -- draft → in_progress: clamp started_at to server time.
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'invalid_transition: % -> in_progress', OLD.status;
    END IF;
    IF NEW.started_at IS NULL
       OR NEW.started_at > now() + max_drift
       OR NEW.started_at < now() - max_drift THEN
      NEW.started_at := now();
    END IF;
  END IF;

  -- started_at cannot be rewritten while the cycle is running.
  IF OLD.status = 'in_progress' AND NEW.status = 'in_progress' THEN
    NEW.started_at := OLD.started_at;
  END IF;

  -- in_progress → completed: the only success path; enforce the minimum.
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    IF OLD.status <> 'in_progress' THEN
      RAISE EXCEPTION 'invalid_transition: % -> completed', OLD.status;
    END IF;
    NEW.started_at := OLD.started_at;
    IF NEW.ended_at IS NULL
       OR NEW.ended_at > now() + max_drift
       OR NEW.ended_at < now() - max_drift THEN
      NEW.ended_at := now();
    END IF;
    IF NEW.started_at IS NULL THEN
      RAISE EXCEPTION 'cycle_never_started';
    END IF;
    IF COALESCE(NEW.duration_minutes, 0) > 0
       AND (NEW.ended_at - NEW.started_at)
           < make_interval(mins => NEW.duration_minutes) - tolerance THEN
      RAISE EXCEPTION 'min_duration_not_met: elapsed %, required % min',
        (NEW.ended_at - NEW.started_at), NEW.duration_minutes;
    END IF;
  END IF;

  -- in_progress → failed: record the end time honestly too.
  IF NEW.status = 'failed' AND OLD.status <> 'failed' THEN
    IF OLD.status <> 'in_progress' THEN
      RAISE EXCEPTION 'invalid_transition: % -> failed', OLD.status;
    END IF;
    NEW.started_at := OLD.started_at;
    IF NEW.ended_at IS NULL
       OR NEW.ended_at > now() + max_drift
       OR NEW.ended_at < now() - max_drift THEN
      NEW.ended_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cycle_integrity_insert ON public.sterilization_sessions;
CREATE TRIGGER trg_enforce_cycle_integrity_insert
  BEFORE INSERT ON public.sterilization_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cycle_integrity_insert();

DROP TRIGGER IF EXISTS trg_enforce_cycle_integrity_update ON public.sterilization_sessions;
CREATE TRIGGER trg_enforce_cycle_integrity_update
  BEFORE UPDATE ON public.sterilization_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cycle_integrity_update();
