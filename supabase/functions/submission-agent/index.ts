
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { proposal_id, submitted_by_user_id, submitted_to, format = 'PDF' } = await req.json();
    
    console.log(`SubmissionAgent triggered for proposal: ${proposal_id}`);

    // First, validate that the proposal is ready for submission
    const { data: proposalData, error: proposalError } = await supabase
      .from('proposals')
      .select(`
        *,
        sections (
          *,
          questions (
            *,
            answers (*),
            clarifications (*)
          )
        )
      `)
      .eq('id', proposal_id)
      .single();

    if (proposalError) {
      throw new Error(`Failed to fetch proposal: ${proposalError.message}`);
    }

    // Validate all questions have answers
    const allQuestions = proposalData.sections?.flatMap((s: any) => s.questions) || [];
    const questionsWithAnswers = allQuestions.filter((q: any) => q.answers?.length > 0);
    const questionsNeedingReview = allQuestions.filter((q: any) => q.requires_review);
    const reviewedQuestions = questionsNeedingReview.filter((q: any) => q.reviewed);

    if (questionsWithAnswers.length !== allQuestions.length) {
      throw new Error('Not all questions have been answered');
    }

    if (reviewedQuestions.length !== questionsNeedingReview.length) {
      throw new Error('Not all required reviews have been completed');
    }

    // Generate final document content
    const documentSections = proposalData.sections
      ?.sort((a: any, b: any) => a.order_index - b.order_index)
      .map((section: any) => ({
        title: section.title,
        questions: section.questions.map((question: any) => ({
          question: question.question_text,
          answer: question.answers?.[0]?.answer_text || '',
          clarification: question.clarifications?.[0]?.answer_text || null,
          confidence_score: question.confidence_score,
          source: question.answers?.[0]?.generated_by || 'AI'
        }))
      })) || [];

    const finalDocument = {
      proposal_title: proposalData.title,
      client_name: proposalData.client_name,
      generated_at: new Date().toISOString(),
      sections: documentSections,
      summary: {
        total_questions: allQuestions.length,
        questions_answered: questionsWithAnswers.length,
        reviews_completed: reviewedQuestions.length
      }
    };

    // Create submission record
    const { data: submissionData, error: submissionError } = await supabase
      .from('submissions')
      .insert({
        proposal_id,
        submitted_by_user_id,
        submitted_to: submitted_to || 'client@example.com',
        format,
        status: 'submitted'
      })
      .select()
      .single();

    if (submissionError) {
      throw new Error(`Failed to create submission: ${submissionError.message}`);
    }

    // Update proposal status
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ status: 'submitted' })
      .eq('id', proposal_id);

    if (updateError) {
      throw new Error(`Failed to update proposal status: ${updateError.message}`);
    }

    // Log submission
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'submission_agent',
        action: 'submitted_proposal',
        proposal_id,
        triggered_by_user_id: submitted_by_user_id,
        metadata: {
          proposal_id,
          submitted_by: submitted_by_user_id,
          submitted_at: new Date().toISOString(),
          num_questions: allQuestions.length,
          delivery_type: format,
          submission_id: submissionData.id
        }
      });

    if (logError) {
      console.error('Error logging submission:', logError);
    }

    console.log(`Proposal ${proposal_id} successfully submitted`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Proposal submitted successfully',
        data: {
          submission_id: submissionData.id,
          proposal_id,
          document: finalDocument
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('SubmissionAgent error:', error);
    
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
