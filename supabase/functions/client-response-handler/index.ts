
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { submission_id, responses, contact_email } = await req.json();
    
    console.log(`ClientResponseHandler triggered for submission: ${submission_id}`);
    console.log(`Processing ${Object.keys(responses).length} clarification responses`);

    if (!submission_id || !responses || typeof responses !== 'object') {
      throw new Error('Invalid request: submission_id and responses are required');
    }

    // Verify submission exists and is valid
    const { data: submission, error: submissionError } = await supabase
      .from('clarification_submissions')
      .select('id, expires_at, proposal_id')
      .eq('id', submission_id)
      .single();

    if (submissionError || !submission) {
      console.error('Submission not found:', submissionError);
      throw new Error('Submission not found or has expired');
    }

    // Check if submission has expired
    if (new Date() > new Date(submission.expires_at)) {
      throw new Error('This submission has expired');
    }

    // Get all clarifications for this submission
    const { data: clarifications, error: clarificationsError } = await supabase
      .from('clarifications')
      .select('id, status')
      .eq('submission_id', submission_id)
      .eq('status', 'submitted_to_client');

    if (clarificationsError) {
      console.error('Error fetching clarifications:', clarificationsError);
      throw clarificationsError;
    }

    if (!clarifications || clarifications.length === 0) {
      throw new Error('No clarifications found for this submission');
    }

    console.log(`Found ${clarifications.length} clarifications to update`);

    // Validate that all provided responses match existing clarifications
    const clarificationIds = clarifications.map(c => c.id);
    const responseIds = Object.keys(responses);
    const invalidIds = responseIds.filter(id => !clarificationIds.includes(id));

    if (invalidIds.length > 0) {
      console.error('Invalid clarification IDs:', invalidIds);
      throw new Error(`Invalid clarification IDs: ${invalidIds.join(', ')}`);
    }

    // Validate that responses are provided for all clarifications
    const missingResponses = clarificationIds.filter(id => !responses[id] || !responses[id].trim());
    if (missingResponses.length > 0) {
      throw new Error(`Missing responses for clarifications: ${missingResponses.join(', ')}`);
    }

    const currentTimestamp = new Date().toISOString();
    let updatedCount = 0;

    // Update each clarification with the response
    for (const clarificationId of clarificationIds) {
      const responseText = responses[clarificationId];
      
      if (responseText && responseText.trim()) {
        const { error: updateError } = await supabase
          .from('clarifications')
          .update({
            response_text: responseText.trim(),
            status: 'answered',
            answered_at: currentTimestamp,
            answered_by_email: contact_email || null
          })
          .eq('id', clarificationId)
          .eq('status', 'submitted_to_client'); // Extra safety check

        if (updateError) {
          console.error(`Error updating clarification ${clarificationId}:`, updateError);
          throw new Error(`Failed to update clarification ${clarificationId}: ${updateError.message}`);
        }

        updatedCount++;
        console.log(`Successfully updated clarification ${clarificationId}`);
      }
    }

    // After successful clarification updates, trigger content-agent
    try {
      console.log(`Triggering content-agent for proposal: ${submission.proposal_id}`);
      
      // Check if there's already a pending ContentAgent log to avoid duplicates
      const { data: existingLogs, error: logCheckError } = await supabase
        .from('agent_logs')
        .select('id')
        .eq('proposal_id', submission.proposal_id)
        .eq('agent_name', 'ContentAgent')
        .eq('metadata->>status', 'pending')
        .limit(1);

      if (logCheckError) {
        console.error('Error checking existing logs:', logCheckError);
      } else if (existingLogs && existingLogs.length > 0) {
        console.log('ContentAgent already pending for this proposal, skipping duplicate trigger');
      } else {
        // No pending ContentAgent log, safe to trigger
        const { data: contentAgentData, error: contentAgentError } = await supabase.functions.invoke('content-agent', {
          body: {
            proposal_id: submission.proposal_id,
            submission_id: submission_id,
            trigger_source: 'client_response'
          }
        });

        if (contentAgentError) {
          console.error('Failed to trigger content-agent:', contentAgentError);
          // Don't throw error - we don't want to fail the client response submission
        } else {
          console.log('Successfully triggered content-agent:', contentAgentData);
        }
      }
    } catch (triggerError) {
      // Log error but don't fail the client response submission
      console.error('Error triggering content-agent:', triggerError);
    }

    // Log the response submission
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'client_response_handler',
        action: 'responses_submitted',
        proposal_id: submission.proposal_id,
        triggered_by_user_id: null, // This is a client submission
        metadata: {
          submission_id,
          clarifications_updated: updatedCount,
          total_clarifications: clarifications.length,
          contact_email: contact_email || null,
          response_timestamp: currentTimestamp
        }
      });

    if (logError) {
      console.error('Error logging response submission:', logError);
    }

    console.log(`ClientResponseHandler completed successfully. Updated ${updatedCount} clarifications for submission ${submission_id}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Responses submitted successfully',
        data: {
          submission_id,
          clarifications_updated: updatedCount,
          total_clarifications: clarifications.length,
          submitted_at: currentTimestamp
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ClientResponseHandler error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
