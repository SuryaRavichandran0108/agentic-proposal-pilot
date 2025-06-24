
-- Create the trigger function
CREATE OR REPLACE FUNCTION public.check_all_clarifications_answered()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_submission_id UUID;
    v_proposal_id UUID;
    v_total_clarifications INTEGER;
    v_answered_clarifications INTEGER;
    v_existing_log_count INTEGER;
BEGIN
    -- Only proceed if status or response_text was updated
    IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.response_text IS DISTINCT FROM NEW.response_text) THEN
        
        -- Get the submission_id from the updated clarification
        v_submission_id := NEW.submission_id;
        
        -- Skip if no submission_id (shouldn't happen for answered clarifications)
        IF v_submission_id IS NULL THEN
            RETURN NEW;
        END IF;
        
        -- Get the proposal_id from the clarification_submissions table
        SELECT proposal_id INTO v_proposal_id
        FROM clarification_submissions
        WHERE id = v_submission_id;
        
        -- Skip if no proposal found
        IF v_proposal_id IS NULL THEN
            RETURN NEW;
        END IF;
        
        -- Count total clarifications for this submission
        SELECT COUNT(*) INTO v_total_clarifications
        FROM clarifications
        WHERE submission_id = v_submission_id;
        
        -- Count answered clarifications (status = 'answered' AND response_text IS NOT NULL)
        SELECT COUNT(*) INTO v_answered_clarifications
        FROM clarifications
        WHERE submission_id = v_submission_id
        AND status = 'answered'
        AND response_text IS NOT NULL;
        
        -- Check if all clarifications are answered
        IF v_total_clarifications = v_answered_clarifications AND v_total_clarifications > 0 THEN
            
            -- Check for existing pending ContentAgent log to prevent duplicates
            SELECT COUNT(*) INTO v_existing_log_count
            FROM agent_logs
            WHERE proposal_id = v_proposal_id
            AND agent_name = 'ContentAgent'
            AND metadata->>'status' = 'pending'
            AND metadata->>'submission_id' = v_submission_id::text;
            
            -- If no existing log, create one
            IF v_existing_log_count = 0 THEN
                INSERT INTO agent_logs (
                    proposal_id,
                    agent_name,
                    action,
                    metadata
                ) VALUES (
                    v_proposal_id,
                    'ContentAgent',
                    'trigger_content_generation',
                    jsonb_build_object(
                        'status', 'pending',
                        'submission_id', v_submission_id,
                        'message', 'All clarifications answered for submission ' || v_submission_id,
                        'trigger_source', 'clarifications_answered'
                    )
                );
            END IF;
            
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_content_agent_after_clarifications ON clarifications;
CREATE TRIGGER trigger_content_agent_after_clarifications
    AFTER UPDATE ON clarifications
    FOR EACH ROW
    EXECUTE FUNCTION check_all_clarifications_answered();
