
-- Create function to process pending ContentAgent logs
CREATE OR REPLACE FUNCTION public.process_pending_content_agent_logs()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    log_record RECORD;
    clarification_record RECORD;
    question_record RECORD;
    generated_answer TEXT;
    processed_question_ids UUID[];
    submission_id_text TEXT;
BEGIN
    -- Process all pending ContentAgent logs
    FOR log_record IN 
        SELECT id, proposal_id, metadata
        FROM agent_logs
        WHERE agent_name = 'ContentAgent'
        AND metadata->>'status' = 'pending'
    LOOP
        RAISE NOTICE 'Processing agent log: %', log_record.id;
        
        -- Extract submission_id from metadata
        submission_id_text := log_record.metadata->>'submission_id';
        
        IF submission_id_text IS NULL THEN
            RAISE NOTICE 'No submission_id found in metadata for log: %', log_record.id;
            CONTINUE;
        END IF;
        
        processed_question_ids := ARRAY[]::UUID[];
        
        -- Fetch all answered clarifications for this submission
        FOR clarification_record IN
            SELECT question_id, response_text
            FROM clarifications
            WHERE submission_id = submission_id_text::UUID
            AND status = 'answered'
            AND response_text IS NOT NULL
        LOOP
            -- Get the question details
            SELECT * INTO question_record
            FROM questions
            WHERE id = clarification_record.question_id;
            
            IF question_record.id IS NOT NULL THEN
                RAISE NOTICE 'Processing question: %', question_record.id;
                
                -- Generate AI-style response
                generated_answer := 'Based on the client''s response: "' || 
                    SUBSTRING(clarification_record.response_text, 1, 200) || 
                    CASE 
                        WHEN LENGTH(clarification_record.response_text) > 200 THEN '..."'
                        ELSE '"'
                    END ||
                    ', here is the proposed answer to the question: "' ||
                    SUBSTRING(question_record.question_text, 1, 100) ||
                    CASE 
                        WHEN LENGTH(question_record.question_text) > 100 THEN '..."'
                        ELSE '"'
                    END ||
                    E'\n\nOur comprehensive approach addresses the client''s specific requirements by incorporating their feedback into our solution framework. We have carefully considered their response and tailored our methodology to align with their expressed needs and constraints.' ||
                    E'\n\nThis solution leverages industry best practices while directly addressing the clarification points raised. Our implementation strategy ensures seamless integration with the client''s existing infrastructure and operational requirements.' ||
                    E'\n\nBased on the clarification provided, we recommend a phased approach that prioritizes the key concerns identified in the client''s response, ensuring optimal outcomes and stakeholder satisfaction.';
                
                -- Insert or update answer
                INSERT INTO answers (question_id, answer_text, generated_by, version_number, created_at)
                VALUES (
                    question_record.id,
                    generated_answer,
                    'AI',
                    1,
                    NOW()
                )
                ON CONFLICT (question_id) 
                DO UPDATE SET
                    answer_text = EXCLUDED.answer_text,
                    generated_by = EXCLUDED.generated_by,
                    version_number = answers.version_number + 1,
                    created_at = NOW();
                
                -- Add to processed list
                processed_question_ids := array_append(processed_question_ids, question_record.id);
                
                RAISE NOTICE 'Processed question: %', question_record.id;
            END IF;
        END LOOP;
        
        -- Check if any questions were processed
        IF array_length(processed_question_ids, 1) > 0 THEN
            -- Update agent log metadata to completed
            UPDATE agent_logs
            SET metadata = jsonb_set(
                jsonb_set(
                    jsonb_set(
                        metadata,
                        '{status}',
                        '"completed"'
                    ),
                    '{completed_at}',
                    to_jsonb(NOW()::TEXT)
                ),
                '{processed_questions}',
                to_jsonb(processed_question_ids)
            )
            WHERE id = log_record.id;
            
            RAISE NOTICE 'Completed processing log: % with % questions', log_record.id, array_length(processed_question_ids, 1);
        ELSE
            RAISE NOTICE 'No clarifications found for submission: %', submission_id_text;
            
            -- Update status to completed even if no questions processed
            UPDATE agent_logs
            SET metadata = jsonb_set(
                jsonb_set(
                    metadata,
                    '{status}',
                    '"completed"'
                ),
                '{completed_at}',
                to_jsonb(NOW()::TEXT)
            )
            WHERE id = log_record.id;
        END IF;
        
    END LOOP;
    
    RAISE NOTICE 'Finished processing all pending ContentAgent logs';
END;
$$;
