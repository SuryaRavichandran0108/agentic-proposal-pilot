
-- Drop the existing function first
DROP FUNCTION IF EXISTS get_clarifications_for_user();

-- Add submission_id to clarifications table to properly link clarifications to their submissions
ALTER TABLE clarifications 
ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES clarification_submissions(id);

-- Recreate the get_clarifications_for_user function with submission_id included
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
