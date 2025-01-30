-- Create the processed_leads table in the public schema
CREATE TABLE public.processed_leads (
    id SERIAL PRIMARY KEY,
    lead_id TEXT UNIQUE NOT NULL,
    lead_type TEXT NOT NULL,
    meta_submitted_at TIMESTAMPTZ,
    form_type TEXT,
    form_id TEXT,
    created_time TIMESTAMPTZ,
    processed_at TIMESTAMPTZ DEFAULT now(),
    platform TEXT,
    ad_id TEXT,
    ad_set_id TEXT,
    campaign_id TEXT,
    full_name TEXT,
    email TEXT,
    phone_number TEXT,
    company_name TEXT,
    event_type TEXT,
    preferred_event_date TEXT,
    event_planning_timeline TEXT,
    expected_attendees TEXT,
    event_group_type TEXT,
    budget_per_person TEXT,
    additional_activities TEXT,
    interested_activities TEXT,
    previous_lengolf_experience TEXT,
    group_size TEXT,
    preferred_time TEXT,
    planned_visit TEXT,
    additional_inquiries TEXT,
    raw_fields JSONB,
    spam_score INTEGER,
    spam_reasons TEXT[],
    is_likely_spam BOOLEAN
);

-- Create indexes for common queries
CREATE INDEX idx_processed_leads_lead_type ON public.processed_leads(lead_type);
CREATE INDEX idx_processed_leads_created_time ON public.processed_leads(created_time);
CREATE INDEX idx_processed_leads_is_likely_spam ON public.processed_leads(is_likely_spam);
CREATE INDEX idx_processed_leads_email ON public.processed_leads(email);
