-- Custom Forms System
-- Allows coaches (and the platform owner) to create custom intake forms

-- Form Templates table - stores form definitions
CREATE TABLE IF NOT EXISTS form_templates (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    form_config JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    is_owner_form BOOLEAN DEFAULT false, -- True for platform owner's personal forms
    branding JSONB DEFAULT '{}', -- Custom colors, logo, etc.
    thank_you_message TEXT DEFAULT 'Thanks for filling out this form! We''ll be in touch soon.',
    notification_email VARCHAR(255), -- Email to notify on submission
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Responses table - stores submissions
CREATE TABLE IF NOT EXISTS form_responses (
    id BIGSERIAL PRIMARY KEY,
    form_template_id BIGINT REFERENCES form_templates(id) ON DELETE CASCADE,
    response_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}', -- UTM params, referrer, etc.
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    is_read BOOLEAN DEFAULT false,
    notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_templates_coach_id ON form_templates(coach_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_slug ON form_templates(slug);
CREATE INDEX IF NOT EXISTS idx_form_templates_is_active ON form_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_form_responses_form_template_id ON form_responses(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at ON form_responses(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_is_read ON form_responses(is_read);

-- RLS Policies
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- Form templates: coaches can manage their own, public can read active forms
CREATE POLICY "Coaches can manage their own form templates"
    ON form_templates
    FOR ALL
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Anyone can read active form templates"
    ON form_templates
    FOR SELECT
    USING (is_active = true);

-- Form responses: coaches can read responses to their forms
CREATE POLICY "Coaches can read their form responses"
    ON form_responses
    FOR SELECT
    USING (
        form_template_id IN (
            SELECT id FROM form_templates WHERE coach_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can update their form responses"
    ON form_responses
    FOR UPDATE
    USING (
        form_template_id IN (
            SELECT id FROM form_templates WHERE coach_id = auth.uid()
        )
    );

-- Anyone can insert form responses (public form submission)
CREATE POLICY "Anyone can submit form responses"
    ON form_responses
    FOR INSERT
    WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_form_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_form_templates_updated_at ON form_templates;
CREATE TRIGGER trigger_form_templates_updated_at
    BEFORE UPDATE ON form_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_form_templates_updated_at();
