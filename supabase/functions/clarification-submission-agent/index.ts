
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  proposal_id: string;
  clarification_ids: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { proposal_id, clarification_ids }: RequestBody = await req.json();

    console.log('Clarification Submission Agent triggered for proposal:', proposal_id);
    console.log('Clarification IDs to submit:', clarification_ids);

    // Get proposal details
    const { data: proposal, error: proposalError } = await supabaseClient
      .from('proposals')
      .select('title, client_name, created_by')
      .eq('id', proposal_id)
      .single();

    if (proposalError || !proposal) {
      throw new Error(`Failed to fetch proposal: ${proposalError?.message}`);
    }

    // Get user details
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('name')
      .eq('id', proposal.created_by)
      .single();

    if (userError || !user) {
      throw new Error(`Failed to fetch user: ${userError?.message}`);
    }

    // Verify all clarifications are approved and belong to this proposal
    const { data: clarifications, error: clarificationsError } = await supabaseClient
      .rpc('get_clarifications_for_user');

    if (clarificationsError) {
      throw new Error(`Failed to fetch clarifications: ${clarificationsError.message}`);
    }

    const validClarifications = clarifications?.filter(c => 
      clarification_ids.includes(c.clarification_id) &&
      c.proposal_id === proposal_id && 
      c.status === 'approved'
    ) || [];

    if (validClarifications.length === 0) {
      throw new Error('No valid approved clarifications found for submission');
    }

    if (validClarifications.length !== clarification_ids.length) {
      console.warn('Some clarifications were not found or not approved');
    }

    // Generate the draft message
    const clarificationQuestions = validClarifications
      .map((c, index) => `${index + 1}. ${c.edited_prompt_text || c.prompt_text}`)
      .join('\n\n');

    const draftMessage = `Subject: Clarification Questions for ${proposal.client_name} – ${proposal.title}

Dear ${proposal.client_name} Team,

As part of our review of the RFP titled "${proposal.title}", we have a few clarifications we'd like to confirm to ensure a complete and accurate response:

${clarificationQuestions}

Please let us know at your earliest convenience.

Sincerely,
${user.name}`;

    console.log('Generated draft message for', validClarifications.length, 'clarifications');

    // Create the submission record first
    const { data: submission, error: submissionError } = await supabaseClient
      .from('clarification_submissions')
      .insert({
        proposal_id,
        user_id: proposal.created_by,
        draft_message: draftMessage,
        method: null
      })
      .select()
      .single();

    if (submissionError) {
      throw new Error(`Failed to create submission: ${submissionError.message}`);
    }

    console.log('Created submission record:', submission.id);

    // Update all validated clarifications to 'submitted_to_client' status and link to submission
    const { error: updateError } = await supabaseClient
      .from('clarifications')
      .update({ 
        status: 'submitted_to_client',
        submission_id: submission.id
      })
      .in('id', validClarifications.map(c => c.clarification_id));

    if (updateError) {
      // If updating clarifications fails, we should clean up the submission record
      await supabaseClient
        .from('clarification_submissions')
        .delete()
        .eq('id', submission.id);
      
      throw new Error(`Failed to update clarification status: ${updateError.message}`);
    }

    console.log('Successfully created submission and updated', validClarifications.length, 'clarification statuses');

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        draft_message: draftMessage,
        clarifications_count: validClarifications.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Clarification Submission Agent error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
