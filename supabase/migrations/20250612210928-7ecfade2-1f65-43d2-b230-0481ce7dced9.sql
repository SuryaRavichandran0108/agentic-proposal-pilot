
-- Add new columns to clarifications table for client responses
ALTER TABLE clarifications 
ADD COLUMN IF NOT EXISTS response_text text,
ADD COLUMN IF NOT EXISTS answered_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS response_metadata jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS answered_by_email text;

-- Add passcode support to clarification_submissions table
ALTER TABLE clarification_submissions
ADD COLUMN IF NOT EXISTS passcode text,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + interval '30 days');

-- Update the get_clarifications_for_user function to include new fields
DROP FUNCTION IF EXISTS get_clarifications_for_user();

CREATE OR REPLACE FUNCTION get_clarifications_for_user()
RETURNS TABLE (
  clarification_id uuid,
  prompt_text text,
  status clarification_status,
  suggested_by clarification_suggested_by,
  created_at timestamp with time zone,
  answer_text text,
  answered_at timestamp with time zone,
  edited_prompt_text text,
  approved_by_user_id uuid,
  submission_id uuid,
  response_text text,
  response_metadata jsonb,
  answered_by_email text,
  question_id uuid,
  question_text text,
  section_id uuid,
  section_title text,
  proposal_id uuid,
  proposal_title text,
  client_name text,
  created_by uuid
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    c.id AS clarification_id,
    c.prompt_text,
    c.status,
    c.suggested_by,
    c.created_at,
    c.answer_text,
    c.answered_at,
    c.edited_prompt_text,
    c.approved_by_user_id,
    c.submission_id,
    c.response_text,
    c.response_metadata,
    c.answered_by_email,
    q.id AS question_id,
    q.question_text,
    s.id AS section_id,
    s.title AS section_title,
    p.id AS proposal_id,
    p.title AS proposal_title,
    p.client_name,
    p.created_by
  FROM clarifications c
  JOIN questions q ON c.question_id = q.id
  JOIN sections s ON q.section_id = s.id
  JOIN proposals p ON s.proposal_id = p.id
  WHERE p.created_by = auth.uid();
$$;

-- Create function to get clarifications by submission_id for public client access
CREATE OR REPLACE FUNCTION get_clarifications_by_submission(submission_uuid uuid)
RETURNS TABLE (
  clarification_id uuid,
  prompt_text text,
  edited_prompt_text text,
  response_text text,
  status clarification_status,
  proposal_title text,
  client_name text,
  created_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    c.id AS clarification_id,
    c.prompt_text,
    c.edited_prompt_text,
    c.response_text,
    c.status,
    p.title AS proposal_title,
    p.client_name,
    c.created_at
  FROM clarifications c
  JOIN questions q ON c.question_id = q.id
  JOIN sections s ON q.section_id = s.id
  JOIN proposals p ON s.proposal_id = p.id
  JOIN clarification_submissions cs ON c.submission_id = cs.id
  WHERE cs.id = submission_uuid
  AND c.status = 'submitted_to_client'
  ORDER BY c.created_at;
$$;

-- Create function to get submission details for client form
CREATE OR REPLACE FUNCTION get_submission_details(submission_uuid uuid)
RETURNS TABLE (
  submission_id uuid,
  proposal_title text,
  client_name text,
  created_at timestamp with time zone,
  passcode text,
  expires_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    cs.id AS submission_id,
    p.title AS proposal_title,
    p.client_name,
    cs.created_at,
    cs.passcode,
    cs.expires_at
  FROM clarification_submissions cs
  JOIN proposals p ON cs.proposal_id = p.id
  WHERE cs.id = submission_uuid;
$$;
