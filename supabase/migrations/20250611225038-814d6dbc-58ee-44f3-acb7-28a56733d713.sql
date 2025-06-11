
-- Update clarifications table to support the new workflow
-- First, check if status column exists and handle accordingly
DO $$
BEGIN
    -- Add new columns to clarifications table
    ALTER TABLE clarifications 
    ADD COLUMN IF NOT EXISTS edited_prompt_text text,
    ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id);
    
    -- Create the new enum type
    DROP TYPE IF EXISTS clarification_status CASCADE;
    CREATE TYPE clarification_status AS ENUM ('suggested', 'approved', 'denied', 'submitted_to_client', 'answered');
    
    -- Add the new status column with default value
    ALTER TABLE clarifications 
    ADD COLUMN IF NOT EXISTS status clarification_status DEFAULT 'suggested';
    
    -- If there are existing clarifications, set them to 'suggested' status
    UPDATE clarifications SET status = 'suggested' WHERE status IS NULL;
END $$;

-- Create clarification_submissions table
CREATE TABLE IF NOT EXISTS clarification_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  submitted_at timestamp with time zone DEFAULT now(),
  method text DEFAULT null,
  draft_message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on the new table
ALTER TABLE clarification_submissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for clarification_submissions (drop existing if it exists)
DROP POLICY IF EXISTS "Users can view their own clarification submissions" ON clarification_submissions;
CREATE POLICY "Users can view their own clarification submissions"
ON clarification_submissions
FOR ALL
USING (user_id = auth.uid());

-- Update the get_clarifications_for_user function to handle new status values
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
