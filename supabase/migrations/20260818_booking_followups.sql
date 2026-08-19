-- Healing follow-up tracking for bookings.
--
-- Adds the two columns the admin API uses to track the scheduled
-- "healed photos + review" check-in email:
--   followup_email_id       Resend email id of the scheduled send (lets us cancel it)
--   followup_scheduled_for  when that email will go / went out
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.bookings
  add column if not exists followup_email_id text,
  add column if not exists followup_scheduled_for timestamptz;
