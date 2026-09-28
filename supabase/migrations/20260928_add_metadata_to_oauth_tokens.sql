-- Add metadata jsonb column to oauth_tokens for storing additional platform-specific details like Slack team_id
ALTER TABLE public.oauth_tokens
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
