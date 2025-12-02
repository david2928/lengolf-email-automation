-- Migration: Email Automation Booking System
-- Description: Add tables and columns for automated booking creation from ClassPass and ResOS emails
-- Date: 2025-12-01

-- ============================================================================
-- 1. Create processed_emails table to track processed emails and prevent duplicates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.processed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('classpass', 'resos')),
  email_subject TEXT,
  email_date TIMESTAMPTZ,
  booking_id TEXT,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('booking_created', 'booking_cancelled', 'no_slots', 'error')),
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_processed_emails_gmail_id ON public.processed_emails(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_source ON public.processed_emails(source_type);
CREATE INDEX IF NOT EXISTS idx_processed_emails_booking ON public.processed_emails(booking_id) WHERE booking_id IS NOT NULL;

-- Add table comment
COMMENT ON TABLE public.processed_emails IS 'Tracks processed ClassPass and ResOS emails to prevent duplicate booking creation and enable audit trail';

-- Add column comments
COMMENT ON COLUMN public.processed_emails.gmail_message_id IS 'Unique Gmail message ID for deduplication';
COMMENT ON COLUMN public.processed_emails.source_type IS 'Email source: classpass or resos';
COMMENT ON COLUMN public.processed_emails.action_taken IS 'Action performed: booking_created, booking_cancelled, no_slots, or error';

-- ============================================================================
-- 2. Extend bookings table with customer_contacted_via and reservation_key
-- ============================================================================

-- Add customer_contacted_via column (matches existing UI field name for consistency)
-- This field was previously used in UI forms but not persisted to the database
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS customer_contacted_via TEXT;

-- Add reservation_key for ClassPass cancellation matching
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS reservation_key TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_bookings_reservation_key ON public.bookings(reservation_key) WHERE reservation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_customer_contacted_via ON public.bookings(customer_contacted_via) WHERE customer_contacted_via IS NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.bookings.customer_contacted_via IS 'Channel through which customer was contacted or booking was created: "Walk-in", "Phone", "LINE", "Website", "ClassPass", "ResOS", "Email Automation", etc.';
COMMENT ON COLUMN public.bookings.reservation_key IS 'External reservation identifier from ClassPass or other booking platforms for cancellation matching. Example: ClassPass reservation IDs.';

-- ============================================================================
-- 3. Enable Row Level Security (optional, based on requirements)
-- ============================================================================

-- Enable RLS on processed_emails if needed
-- ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
-- CREATE POLICY "Service role can manage processed_emails"
-- ON public.processed_emails
-- FOR ALL
-- TO service_role
-- USING (true);
