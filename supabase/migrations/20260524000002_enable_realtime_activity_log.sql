-- Enable Supabase Realtime on activity_log so INSERT events push to clients via websocket
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
