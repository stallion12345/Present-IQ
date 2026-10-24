CREATE TABLE IF NOT EXISTS public.usage_log (
  day date NOT NULL,
  key text NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_usage_limit(
  p_day date,
  p_ip_key text,
  p_ip_limit int,
  p_global_limit int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ip_count int;
  global_count int;
BEGIN
  IF p_ip_key IS NULL OR p_ip_key = 'global' THEN
    RAISE EXCEPTION 'Invalid IP usage key';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('usage_log:' || p_day::text, 0));

  INSERT INTO public.usage_log (day, key, count)
  VALUES (p_day, 'global', 0), (p_day, p_ip_key, 0)
  ON CONFLICT (day, key) DO NOTHING;

  SELECT count INTO global_count
  FROM public.usage_log
  WHERE day = p_day AND key = 'global'
  FOR UPDATE;

  SELECT count INTO ip_count
  FROM public.usage_log
  WHERE day = p_day AND key = p_ip_key
  FOR UPDATE;

  IF global_count >= p_global_limit OR ip_count >= p_ip_limit THEN
    RETURN false;
  END IF;

  UPDATE public.usage_log SET count = count + 1
  WHERE day = p_day AND key IN ('global', p_ip_key);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_usage_limit(date, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_usage_limit(date, text, int, int) TO service_role;
