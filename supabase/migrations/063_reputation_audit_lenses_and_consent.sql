-- Migration: 063_reputation_audit_lenses_and_consent.sql
-- Description: Multi-lens reputation audits (Full, Investor, Hiring, Behavioral) and audit consent grants.

-- 1. Enhance reputation_audits table with extracted_findings and stage
DO $$
BEGIN
  -- Add stage column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reputation_audits' AND column_name = 'stage'
  ) THEN
    ALTER TABLE reputation_audits ADD COLUMN stage TEXT DEFAULT 'pending';
  END IF;

  -- Add extracted_findings JSONB column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reputation_audits' AND column_name = 'extracted_findings'
  ) THEN
    ALTER TABLE reputation_audits ADD COLUMN extracted_findings JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2. Create audit_lenses table
CREATE TABLE IF NOT EXISTS audit_lenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES reputation_audits(id) ON DELETE CASCADE,
  lens_type TEXT NOT NULL CHECK (lens_type IN ('full', 'investor', 'reputation', 'hiring', 'behavioral')),
  risk_score DECIMAL(3, 1),
  narrative TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT uq_audit_lens UNIQUE (audit_id, lens_type)
);

CREATE INDEX IF NOT EXISTS idx_audit_lenses_audit_id ON audit_lenses(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_lenses_type ON audit_lenses(audit_id, lens_type);

-- Enable RLS on audit_lenses
ALTER TABLE audit_lenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view lenses of their own audits" ON audit_lenses;
CREATE POLICY "Users can view lenses of their own audits" ON audit_lenses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reputation_audits ra
      WHERE ra.id = audit_lenses.audit_id AND ra.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert lenses for their own audits" ON audit_lenses;
CREATE POLICY "Users can insert lenses for their own audits" ON audit_lenses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reputation_audits ra
      WHERE ra.id = audit_lenses.audit_id AND ra.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update lenses for their own audits" ON audit_lenses;
CREATE POLICY "Users can update lenses for their own audits" ON audit_lenses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reputation_audits ra
      WHERE ra.id = audit_lenses.audit_id AND ra.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete lenses of their own audits" ON audit_lenses;
CREATE POLICY "Users can delete lenses of their own audits" ON audit_lenses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reputation_audits ra
      WHERE ra.id = audit_lenses.audit_id AND ra.user_id = auth.uid()
    )
  );

-- 3. Create audit_consent_grants table (for future company/org access)
CREATE TABLE IF NOT EXISTS audit_consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  scope TEXT[] NOT NULL DEFAULT '{"full"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_subject ON audit_consent_grants(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_consent_org ON audit_consent_grants(organization_id);

-- Enable RLS on audit_consent_grants
ALTER TABLE audit_consent_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own consent grants" ON audit_consent_grants;
CREATE POLICY "Users can view their own consent grants" ON audit_consent_grants
  FOR SELECT USING (auth.uid() = subject_user_id);

DROP POLICY IF EXISTS "Users can insert their own consent grants" ON audit_consent_grants;
CREATE POLICY "Users can insert their own consent grants" ON audit_consent_grants
  FOR INSERT WITH CHECK (auth.uid() = subject_user_id);

DROP POLICY IF EXISTS "Users can update their own consent grants" ON audit_consent_grants;
CREATE POLICY "Users can update their own consent grants" ON audit_consent_grants
  FOR UPDATE USING (auth.uid() = subject_user_id);

DROP POLICY IF EXISTS "Users can delete their own consent grants" ON audit_consent_grants;
CREATE POLICY "Users can delete their own consent grants" ON audit_consent_grants
  FOR DELETE USING (auth.uid() = subject_user_id);

-- Org member policy: Active org members can view consent grants granted to their organization
DROP POLICY IF EXISTS "Org members can view active consent grants for their org" ON audit_consent_grants;
CREATE POLICY "Org members can view active consent grants for their org" ON audit_consent_grants
  FOR SELECT USING (
    revoked_at IS NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = audit_consent_grants.organization_id
        AND om.user_id = auth.uid()
    )
  );
