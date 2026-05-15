-- Add currency_code to pitches table
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS currency_code text;

-- Seed scouting defaults into app_settings (per-currency)
INSERT INTO public.app_settings (key, value)
VALUES (
  'scouting_defaults',
  '{"EUR": {"conversionRate": 5, "avgTicket": 4.5}, "CZK": {"conversionRate": 5, "avgTicket": 115}, "PLN": {"conversionRate": 5, "avgTicket": 20}}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
