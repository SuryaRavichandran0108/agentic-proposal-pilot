
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
    
    console.log(`ReviewerAssignmentAgent triggered for proposal: ${proposal_id}`);

    // Log the agent action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'reviewer_assignment_agent',
        action: 'started_assignment_process',
        proposal_id,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('Error logging reviewer assignment action:', logError);
    }

    // First, ensure we have mock SME users
    await ensureMockSMEUsers(supabase);

    // Get all questions that require review and haven't been reviewed yet
    const { data: questionsToReview, error: questionsError } = await supabase
      .from('questions')
      .select(`
        *,
        sections!inner (
          proposal_id
        )
      `)
      .eq('sections.proposal_id', proposal_id)
      .eq('requires_review', true)
      .eq('reviewed', false);

    if (questionsError) {
      console.error('Error fetching questions to review:', questionsError);
      throw questionsError;
    }

    if (!questionsToReview || questionsToReview.length === 0) {
      console.log('No questions require review for this proposal');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No questions require review',
          data: {
            proposal_id,
            questions_assigned: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log(`Found ${questionsToReview.length} questions requiring review`);

    let assignedCount = 0;
    const assignments = [];

    for (const question of questionsToReview) {
      // Check if this question already has a pending review assignment
      const { data: existingAssignment } = await supabase
        .from('review_assignments')
        .select('*')
        .eq('question_id', question.id)
        .eq('status', 'pending')
        .single();

      if (existingAssignment) {
        console.log(`Question ${question.id} already has a pending review assignment, skipping`);
        continue;
      }

      // Determine SME assignment based on question content
      const assignedSME = await assignSMEBySpecialty(supabase, question.question_text);
      
      // Create review assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('review_assignments')
        .insert({
          question_id: question.id,
          assigned_to_user_id: assignedSME?.user_id || null,
          status: 'pending'
        })
        .select()
        .single();

      if (assignmentError) {
        console.error(`Error creating review assignment for question ${question.id}:`, assignmentError);
        continue;
      }

      assignments.push({
        question_id: question.id,
        assignment_id: assignment.id,
        assigned_to: assignedSME?.specialty || 'unassigned',
        assigned_to_user_id: assignedSME?.user_id || null
      });

      // Log the individual assignment
      await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'reviewer_assignment_agent',
          action: 'assigned_question_for_review',
          proposal_id,
          question_id: question.id,
          metadata: {
            assignment_id: assignment.id,
            assigned_to_user_id: assignedSME?.user_id || null,
            assigned_specialty: assignedSME?.specialty || 'general',
            triggered_by: 'orchestrator',
            question_text_preview: question.question_text.substring(0, 100)
          }
        });

      assignedCount++;
    }

    // Log the final summary
    await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'reviewer_assignment_agent',
        action: 'completed_assignment_process',
        proposal_id,
        metadata: {
          total_questions_processed: questionsToReview.length,
          assignments_created: assignedCount,
          assignments: assignments
        }
      });

    console.log(`Successfully assigned ${assignedCount} questions for review`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Questions assigned for review',
        data: {
          proposal_id,
          questions_processed: questionsToReview.length,
          assignments_created: assignedCount,
          assignments
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ReviewerAssignmentAgent error:', error);
    
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

async function ensureMockSMEUsers(supabase: any) {
  console.log('Ensuring mock SME users exist...');
  
  const mockSMEs = [
    {
      email: 'pricing_sme@mock.com',
      name: 'Pricing Subject Matter Expert',
      role: 'reviewer'
    },
    {
      email: 'security_sme@mock.com',
      name: 'Security Subject Matter Expert',
      role: 'reviewer'
    }
  ];

  for (const sme of mockSMEs) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', sme.email)
      .single();

    if (!existingUser) {
      console.log(`Creating mock SME user: ${sme.email}`);
      const { error } = await supabase
        .from('users')
        .insert({
          id: crypto.randomUUID(),
          email: sme.email,
          name: sme.name,
          role: sme.role
        });

      if (error) {
        console.error(`Error creating mock SME user ${sme.email}:`, error);
      }
    }
  }
}

async function assignSMEBySpecialty(supabase: any, questionText: string) {
  const lowerText = questionText.toLowerCase();
  
  let targetEmail = null;
  let specialty = 'general';

  // Keyword-based assignment logic
  if (lowerText.includes('pricing') || lowerText.includes('cost') || lowerText.includes('budget') || lowerText.includes('price')) {
    targetEmail = 'pricing_sme@mock.com';
    specialty = 'pricing';
  } else if (lowerText.includes('security') || lowerText.includes('compliance') || lowerText.includes('gdpr') || 
             lowerText.includes('soc') || lowerText.includes('iso') || lowerText.includes('encryption')) {
    targetEmail = 'security_sme@mock.com';
    specialty = 'security';
  }

  if (targetEmail) {
    const { data: smeUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', targetEmail)
      .eq('role', 'reviewer')
      .single();

    if (smeUser) {
      return {
        user_id: smeUser.id,
        specialty
      };
    }
  }

  // No specific assignment found
  return null;
}
