
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

    const { proposal_id, agent_log_id } = await req.json();
    
    console.log(`ContentAgent starting answer generation for proposal: ${proposal_id}`);

    // If triggered by agent_log_id, mark the log as processed
    if (agent_log_id) {
      const { error: logUpdateError } = await supabase
        .from('agent_logs')
        .update({ 
          metadata: { 
            ...((await supabase.from('agent_logs').select('metadata').eq('id', agent_log_id).single()).data?.metadata || {}),
            status: 'processing',
            processed_at: new Date().toISOString()
          }
        })
        .eq('id', agent_log_id);

      if (logUpdateError) {
        console.error('Error updating agent log:', logUpdateError);
      }
    }

    // Verify proposal is still in draft status
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('status')
      .eq('id', proposal_id)
      .single();

    if (proposalError) {
      console.error('Error fetching proposal:', proposalError);
      throw new Error('Failed to fetch proposal');
    }

    if (proposal.status !== 'draft') {
      console.log(`Proposal ${proposal_id} is not in draft status, skipping content generation`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Proposal not in draft status, skipping content generation'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Get all questions for this proposal that don't have answers yet
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select(`
        *,
        sections!inner(proposal_id),
        clarifications(answer_text, response_text, status),
        answers(id)
      `)
      .eq('sections.proposal_id', proposal_id)
      .is('answers.id', null);

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
      throw new Error('Failed to fetch questions');
    }

    console.log(`Found ${questions.length} questions without answers`);

    let answersGenerated = 0;
    const sourceContext = [];

    // Generate answers for each question
    for (const question of questions) {
      try {
        // Get clarification context if available - prioritize answered clarifications
        const answeredClarifications = question.clarifications.filter(c => 
          c.status === 'answered' && c.response_text
        );
        
        const clarificationContext = answeredClarifications
          .map(c => c.response_text)
          .join(' ');

        // Generate mock AI answer with simulated retrieval context
        const answerText = generateMockAnswer(question.question_text, clarificationContext);
        
        // Insert the generated answer
        const { error: insertError } = await supabase
          .from('answers')
          .insert({
            question_id: question.id,
            answer_text: answerText,
            generated_by: 'AI',
            version_number: 1
          });

        if (insertError) {
          console.error(`Error inserting answer for question ${question.id}:`, insertError);
          continue;
        }

        answersGenerated++;
        
        // Track context sources used
        if (clarificationContext) {
          sourceContext.push('clarification_response_used');
        }
        if (question.clarifications.some(c => c.answer_text)) {
          sourceContext.push('clarification_context_used');
        }
        sourceContext.push('prior_answer_match');

        console.log(`Generated answer for question: ${question.id}`);

      } catch (error) {
        console.error(`Error processing question ${question.id}:`, error);
      }
    }

    // Mark the agent log as completed if it was triggered by the database
    if (agent_log_id) {
      const { error: logCompleteError } = await supabase
        .from('agent_logs')
        .update({ 
          metadata: { 
            ...((await supabase.from('agent_logs').select('metadata').eq('id', agent_log_id).single()).data?.metadata || {}),
            status: 'completed',
            completed_at: new Date().toISOString(),
            answers_generated: answersGenerated
          }
        })
        .eq('id', agent_log_id);

      if (logCompleteError) {
        console.error('Error completing agent log:', logCompleteError);
      }
    }

    // Log the content generation action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'content_agent',
        action: 'drafted_answers',
        proposal_id,
        metadata: {
          num_drafted: answersGenerated,
          source_context: [...new Set(sourceContext)],
          timestamp: new Date().toISOString(),
          triggered_by_agent_log: agent_log_id || null
        }
      });

    if (logError) {
      console.error('Error logging content agent action:', logError);
    }

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

    if (!checkError && remainingQuestions.length === 0) {
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

    console.log(`ContentAgent completed: generated ${answersGenerated} answers`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Content generation completed',
        data: {
          proposal_id,
          answers_generated: answersGenerated,
          source_context: [...new Set(sourceContext)]
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

function generateMockAnswer(questionText: string, clarificationContext: string): string {
  // Simulate AI answer generation with mock retrieval context
  const retrievalExamples = [
    "In a previous RFP for Acme Corp, we emphasized API-first design for this question.",
    "Based on past responses, we typically cite SOC 2 and ISO 27001 compliance.",
    "Our standard approach includes implementing microservices architecture with Docker containers.",
    "Previous successful proposals highlighted our 99.9% uptime SLA and 24/7 monitoring.",
    "We typically reference our experience with GDPR compliance and data encryption at rest.",
    "Our standard security framework includes multi-factor authentication and role-based access control.",
    "Based on similar projects, we recommend agile methodology with bi-weekly sprints.",
    "Our typical timeline includes a discovery phase, development, testing, and deployment phases."
  ];

  // Select a random retrieval example to simulate context matching
  const retrievalContext = retrievalExamples[Math.floor(Math.random() * retrievalExamples.length)];

  let answer = `Based on our analysis of the question: "${questionText.substring(0, 100)}${questionText.length > 100 ? '...' : ''}", we propose the following approach:\n\n`;

  // Add retrieval context
  answer += `${retrievalContext}\n\n`;

  // Add clarification context if available - this is the key enhancement
  if (clarificationContext) {
    answer += `Taking into account the client's clarification responses: "${clarificationContext.substring(0, 300)}${clarificationContext.length > 300 ? '...' : ''}"\n\n`;
    answer += `Based on this specific client input, our tailored solution includes:\n\n`;
  }

  // Generate mock answer based on question type with clarification-informed responses
  if (questionText.toLowerCase().includes('security') || questionText.toLowerCase().includes('compliance')) {
    answer += "Our security approach includes:\n";
    answer += "• Implementation of enterprise-grade security protocols\n";
    answer += "• Regular security audits and penetration testing\n";
    answer += "• Compliance with industry standards (SOC 2, ISO 27001)\n";
    answer += "• Data encryption both in transit and at rest\n";
    answer += "• Multi-factor authentication and role-based access controls";
    
    if (clarificationContext) {
      answer += "\n• Custom security measures addressing your specific requirements";
    }
  } else if (questionText.toLowerCase().includes('technical') || questionText.toLowerCase().includes('architecture')) {
    answer += "Our technical solution includes:\n";
    answer += "• Scalable cloud-native architecture\n";
    answer += "• Microservices design pattern for flexibility\n";
    answer += "• API-first approach for seamless integrations\n";
    answer += "• Automated testing and CI/CD pipelines\n";
    answer += "• Performance monitoring and alerting systems";
    
    if (clarificationContext) {
      answer += "\n• Architecture optimized based on your specific technical requirements";
    }
  } else if (questionText.toLowerCase().includes('timeline') || questionText.toLowerCase().includes('schedule')) {
    answer += "Our proposed timeline includes:\n";
    answer += "• Phase 1: Discovery and planning (2-3 weeks)\n";
    answer += "• Phase 2: Development and implementation (8-12 weeks)\n";
    answer += "• Phase 3: Testing and quality assurance (2-3 weeks)\n";
    answer += "• Phase 4: Deployment and go-live (1-2 weeks)\n";
    answer += "• Ongoing support and maintenance";
    
    if (clarificationContext) {
      answer += "\n• Timeline adjusted to accommodate your specific constraints and priorities";
    }
  } else {
    answer += "Our comprehensive approach addresses all requirements through:\n";
    answer += "• Detailed analysis of your specific needs\n";
    answer += "• Implementation of industry best practices\n";
    answer += "• Collaborative approach with your team\n";
    answer += "• Regular progress updates and milestone reviews\n";
    answer += "• Post-implementation support and optimization";
    
    if (clarificationContext) {
      answer += "\n• Customized solution elements based on your clarification responses";
    }
  }

  if (clarificationContext) {
    answer += "\n\nThis solution directly incorporates the additional information you provided during the clarification process, ensuring our proposal precisely addresses your specific requirements and constraints.";
  } else {
    answer += "\n\nThis solution leverages our proven methodologies and ensures successful project delivery while meeting all specified requirements.";
  }

  return answer;
}
