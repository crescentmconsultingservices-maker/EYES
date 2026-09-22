-- Add full_name and pronouns to user_profiles for AI identity grounding
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS pronouns TEXT;
