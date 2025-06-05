
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

    const { proposal_id } = await req.json();
    
    console.log(`ClarificationAgent triggered for proposal: ${proposal_id}`);

    // Query questions that need clarification
    const { data: questionsNeedingClarification, error: questionsError } = await supabase
      .from('questions')
      .select(`
        *,
        sections (
          *,
          proposals (*)
        )
      `)
      .eq('clarification_required', true)
      .eq('clarification_answered', false)
      .eq('sections.proposal_id', proposal_id);

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
      throw questionsError;
    }

    if (!questionsNeedingClarification || questionsNeedingClarification.length === 0) {
      console.log('No questions requiring clarification found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No questions requiring clarification',
          data: {
            questions_flagged: 0,
            clarifications_created: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log(`Found ${questionsNeedingClarification.length} questions needing clarification`);

    // Mock clarification prompts based on question content
    const clarificationPrompts = [
      "Can you clarify the expected metrics for evaluating success for this requirement?",
      "Is there a preferred tool or integration mentioned for this requirement?",
      "Could you provide more specific details about the timeline expectations?",
      "What are the exact compliance standards or certifications required?",
      "Can you elaborate on the scalability requirements and expected user load?",
      "Are there any specific technical constraints or limitations we should be aware of?",
      "What level of customization flexibility is expected for this feature?",
      "Could you specify the preferred deployment model (cloud, on-premise, hybrid)?",
      "What are the data migration requirements and expected data volumes?",
      "Can you provide more details about the integration points with existing systems?"
    ];

    const clarificationsCreated = [];
    
    // Create clarifications for each question
    for (const question of questionsNeedingClarification) {
      // Select a random prompt or generate based on question content
      const randomPrompt = clarificationPrompts[Math.floor(Math.random() * clarificationPrompts.length)];
      
      const { data: clarification, error: clarificationError } = await supabase
        .from('clarifications')
        .insert({
          question_id: question.id,
          prompt_text: randomPrompt,
          suggested_by: 'agent',
          status: 'pending'
        })
        .select()
        .single();

      if (clarificationError) {
        console.error('Error creating clarification:', clarificationError);
        throw clarificationError;
      }

      clarificationsCreated.push(clarification);
      console.log(`Created clarification for question: ${question.question_text}`);
    }

    // Log the agent action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'clarification_agent',
        action: 'generated_clarification_prompts',
        proposal_id,
        metadata: {
          questions_flagged: questionsNeedingClarification.length,
          clarifications_created: clarificationsCreated.length,
          processing_time_ms: Date.now()
        }
      });

    if (logError) {
      console.error('Error logging clarification agent action:', logError);
      // Don't throw here as this is not critical
    }

    console.log(`ClarificationAgent completed successfully. Created ${clarificationsCreated.length} clarifications`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Clarification prompts generated successfully',
        data: {
          proposal_id,
          questions_flagged: questionsNeedingClarification.length,
          clarifications_created: clarificationsCreated.length,
          clarifications: clarificationsCreated
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ClarificationAgent error:', error);
    
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
