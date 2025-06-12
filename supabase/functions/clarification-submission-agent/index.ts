
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

    const { proposal_id, clarification_ids, passcode } = await req.json();
    
    console.log(`ClarificationSubmissionAgent triggered for proposal: ${proposal_id}`);
    console.log(`Processing ${clarification_ids.length} clarifications`);

    // Get proposal details for the submission
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('title, client_name, created_by')
      .eq('id', proposal_id)
      .single();

    if (proposalError) {
      console.error('Error fetching proposal:', proposalError);
      throw proposalError;
    }

    // Get user details for the draft message
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', proposal.created_by)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      throw userError;
    }

    // Generate professional draft message with clarification details
    const { data: clarifications, error: clarificationsError } = await supabase
      .from('clarifications')
      .select('prompt_text, edited_prompt_text')
      .in('id', clarification_ids);

    if (clarificationsError) {
      console.error('Error fetching clarifications:', clarificationsError);
      throw clarificationsError;
    }

    const clarificationQuestions = clarifications
      .map((c, index) => {
        const questionText = c.edited_prompt_text || c.prompt_text;
        return `${index + 1}. ${questionText}`;
      })
      .join('\n\n');

    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create clarification submission record
    const { data: submission, error: submissionError } = await supabase
      .from('clarification_submissions')
      .insert({
        proposal_id,
        user_id: proposal.created_by,
        draft_message: `Professional clarification request for ${proposal.title}`,
        method: 'secure_form',
        passcode: passcode || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      throw submissionError;
    }

    // Update clarifications with submission_id and status
    const { error: updateError } = await supabase
      .from('clarifications')
      .update({ 
        submission_id: submission.id,
        status: 'submitted_to_client'
      })
      .in('id', clarification_ids);

    if (updateError) {
      console.error('Error updating clarifications:', updateError);
      throw updateError;
    }

    // Generate the client response URL
    const clientResponseUrl = `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/client-response/${submission.id}`;

    // Create enhanced professional draft message
    const draftMessage = `Subject: Clarification Request – ${proposal.client_name} / ${proposal.title}

Dear ${proposal.client_name} Team,

We have reviewed the RFP titled "${proposal.title}" and identified several points that require clarification to ensure a complete and accurate response.

We respectfully request your confirmation and additional details on the following items:

${clarificationQuestions}

For your convenience, we have prepared a structured response form that will streamline the clarification process:

🔗 Secure Response Form: ${clientResponseUrl}

${passcode ? `🔒 Access Passcode: ${passcode}` : ''}

This secure form allows you to provide detailed responses to each clarification question. Your responses will be automatically organized and delivered to our proposal team for review.

We appreciate your timely feedback and remain committed to submitting a thorough and compliant response that meets all requirements outlined in your RFP.

Please don't hesitate to contact us if you need any additional information or have questions about this clarification request.

Sincerely,

${user.name || 'Proposal Manager'}
${proposal.client_name} Response Team
Email: ${user.email || 'contact@company.com'}
Date: ${currentDate}

---
This clarification request was generated on ${currentDate} and contains ${clarifications.length} question${clarifications.length !== 1 ? 's' : ''} for your review.
Form expires: ${new Date(submission.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;

    // Update the submission with the final draft message
    await supabase
      .from('clarification_submissions')
      .update({ draft_message: draftMessage })
      .eq('id', submission.id);

    // Log the submission action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'clarification_submission_agent',
        action: 'submission_created',
        proposal_id,
        triggered_by_user_id: proposal.created_by,
        metadata: {
          submission_id: submission.id,
          clarifications_count: clarification_ids.length,
          passcode_protected: !!passcode,
          client_form_url: clientResponseUrl,
          processing_time_ms: Date.now()
        }
      });

    if (logError) {
      console.error('Error logging submission action:', logError);
    }

    console.log(`ClarificationSubmissionAgent completed successfully. Submission ID: ${submission.id}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Clarification submission created successfully',
        data: {
          submission_id: submission.id,
          clarifications_count: clarification_ids.length,
          client_response_url: clientResponseUrl,
          passcode_protected: !!passcode,
          expires_at: submission.expires_at,
          draft_message: draftMessage
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ClarificationSubmissionAgent error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
