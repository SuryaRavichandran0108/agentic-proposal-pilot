
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

    const { proposal_id, agent_log_id, trigger_source } = await req.json();
    
    console.log(`ContentAgent starting processing for proposal: ${proposal_id}, trigger: ${trigger_source || 'unknown'}`);

    // If triggered by agent_log_id, mark the log as processed
    if (agent_log_id) {
      const { error: logUpdateError } = await supabase
        .from('agent_logs')
        .update({ 
          metadata: { 
            ...((await supabase.from('agent_logs').select('metadata').eq('id', agent_log_id).single()).data?.metadata || {}),
            status: 'processing',
            processed_at: new Date().toISOString(),
            trigger_source: trigger_source || 'unknown'
          }
        })
        .eq('id', agent_log_id);

      if (logUpdateError) {
        console.error('Error updating agent log:', logUpdateError);
      }
    }

    // Call the database function to process all pending ContentAgent logs
    const { data: processResult, error: processingError } = await supabase.rpc('process_pending_content_agent_logs');

    if (processingError) {
      console.error('Error processing pending logs:', processingError);
      
      // Update any pending logs to failed status
      if (agent_log_id) {
        await supabase
          .from('agent_logs')
          .update({ 
            metadata: { 
              status: 'failed',
              error_message: processingError.message,
              failed_at: new Date().toISOString()
            }
          })
          .eq('id', agent_log_id);
      }
      
      throw new Error('Failed to process pending content agent logs');
    }

    console.log('Successfully processed all pending ContentAgent logs:', processResult);

    // Check if all questions now have answers and optionally update proposal status
    const { data: remainingQuestions, error: checkError } = await supabase
      .from('questions')
      .select(`
        id,
        sections!inner(proposal_id),
        answers(id)
      `)
      .eq('sections.proposal_id', proposal_id)
      .is('answers.id', null);

    if (!checkError && remainingQuestions && remainingQuestions.length === 0) {
      // All questions have answers, optionally update proposal to review status
      const { error: updateError } = await supabase
        .from('proposals')
        .update({ status: 'review' })
        .eq('id', proposal_id);

      if (updateError) {
        console.error('Error updating proposal status:', updateError);
      } else {
        console.log(`Updated proposal ${proposal_id} status to review`);
      }
    }

    // Get count of completed logs for this proposal to report back
    const { data: completedLogs, error: countError } = await supabase
      .from('agent_logs')
      .select('metadata')
      .eq('proposal_id', proposal_id)
      .eq('agent_name', 'ContentAgent')
      .eq('metadata->>status', 'completed');

    const answersGenerated = completedLogs?.reduce((total, log) => {
      const processedQuestions = log.metadata?.processed_questions;
      return total + (Array.isArray(processedQuestions) ? processedQuestions.length : 0);
    }, 0) || 0;

    console.log(`ContentAgent completed: processed ${answersGenerated} answers`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Content generation completed',
        data: {
          proposal_id,
          answers_generated: answersGenerated,
          trigger_source: trigger_source || 'unknown'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ContentAgent error:', error);
    
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
