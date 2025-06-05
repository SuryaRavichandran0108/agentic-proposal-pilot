
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

    const { proposal_id, trigger, context } = await req.json();
    
    console.log(`Orchestrator triggered for proposal: ${proposal_id}, trigger: ${trigger}`);

    // Log the orchestrator action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'orchestrator_agent',
        action: `triggered_by_${trigger}`,
        proposal_id,
        metadata: {
          trigger_type: trigger,
          context,
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('Error logging orchestrator action:', logError);
    }

    // Based on trigger, determine next actions
    let nextActions = [];
    
    if (trigger === 'parser_completed') {
      if (context.clarifications_needed > 0) {
        nextActions.push('clarification_agent');
        
        // Trigger ClarificationAgent
        try {
          const { error: clarificationError } = await supabase.functions.invoke('clarification-agent', {
            body: { proposal_id }
          });

          if (clarificationError) {
            console.error('Error triggering clarification agent:', clarificationError);
          } else {
            console.log('Successfully triggered ClarificationAgent');
          }
        } catch (clarificationErr) {
          console.error('Failed to trigger ClarificationAgent:', clarificationErr);
        }
      }
      
      if (context.reviews_needed > 0) {
        nextActions.push('review_assignment_agent');
      }
      nextActions.push('content_agent');
    }

    console.log(`Orchestrator determined next actions: ${nextActions.join(', ')}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Orchestrator processed trigger',
        data: {
          proposal_id,
          trigger,
          next_actions: nextActions,
          context
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Orchestrator error:', error);
    
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
