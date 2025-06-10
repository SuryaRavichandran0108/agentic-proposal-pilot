
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

    const { proposal_id, file_id } = await req.json();
    
    console.log(`ParserAgent triggered for proposal: ${proposal_id}, file: ${file_id}`);

    // Simulate parsing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock questions extracted from real-world RFP Section 4 (like Union County RFP)
    const mockRFPQuestions = [
      "4.1.1 Provide a detailed description of your company's organizational structure, including number of employees, years in business, and primary business focus.",
      "4.1.2 Describe your company's experience with similar municipal software implementations in the past five years, including client references.",
      "4.1.3 Detail your proposed project timeline from contract execution to full system deployment and user training completion.",
      "4.1.4 Provide comprehensive information about your software's technical architecture, database requirements, and system integration capabilities.",
      "4.1.5 Describe your data migration approach and methodology for transferring existing municipal data to your system.",
      "4.2.1 Outline your ongoing support structure, including help desk hours, response time commitments, and escalation procedures.",
      "4.2.2 Provide detailed pricing for software licensing, implementation services, training, and ongoing maintenance for a 5-year period.",
      "4.2.3 Describe your disaster recovery and business continuity capabilities, including backup procedures and data security measures.",
      "4.2.4 Detail your user training program, including initial training, ongoing education, and documentation provided.",
      "4.2.5 Explain your software update and enhancement process, including frequency of updates and user notification procedures.",
      "4.2.6 Provide information about third-party integrations available with your system, particularly with financial and HR systems.",
      "4.2.7 Describe your quality assurance testing procedures and how you ensure system reliability and performance.",
      "4.2.8 Detail your implementation methodology and project management approach, including key milestones and deliverables.",
      "4.2.9 Provide information about system scalability and your ability to accommodate future growth in users and data volume.",
      "4.2.10 Describe your approach to customization and configuration to meet specific municipal requirements and workflows."
    ];

    // Create single section for RFP Questions
    const { data: sectionData, error: sectionError } = await supabase
      .from('sections')
      .insert({
        proposal_id,
        title: 'RFP Questions',
        order_index: 1
      })
      .select()
      .single();

    if (sectionError) {
      console.error('Error creating section:', sectionError);
      throw sectionError;
    }

    console.log(`Created section: ${sectionData.title}`);

    // Create questions for this section
    const createdQuestions = [];
    let clarificationCount = 0;
    let reviewCount = 0;

    for (let i = 0; i < mockRFPQuestions.length; i++) {
      const questionText = mockRFPQuestions[i];
      
      // Flag vague or complex questions for clarification
      const needsClarification = clarificationCount < 2 && (
        questionText.includes('detailed description') || 
        questionText.includes('comprehensive information') ||
        questionText.includes('approach to customization')
      );
      
      // Flag technical or complex questions for review
      const needsReview = reviewCount < 2 && !needsClarification && (
        questionText.includes('technical architecture') ||
        questionText.includes('disaster recovery') ||
        questionText.includes('quality assurance')
      );
      
      if (needsClarification) clarificationCount++;
      if (needsReview) reviewCount++;

      const questionData = {
        section_id: sectionData.id,
        question_text: questionText,
        source: 'parsed' as const,
        clarification_required: needsClarification,
        requires_review: needsReview,
        confidence_score: Math.round((Math.random() * 0.25 + 0.70) * 100) / 100 // 0.70 to 0.95
      };

      const { data: question, error: questionError } = await supabase
        .from('questions')
        .insert(questionData)
        .select()
        .single();

      if (questionError) {
        console.error('Error creating question:', questionError);
        throw questionError;
      }

      createdQuestions.push(question);
      console.log(`Created question: ${question.question_text.substring(0, 50)}... (clarification: ${needsClarification}, review: ${needsReview})`);
    }

    // Ensure we have exactly 2 clarifications and 2 reviews
    if (clarificationCount < 2) {
      const questionsToUpdate = createdQuestions
        .filter(q => !q.clarification_required && !q.requires_review)
        .slice(0, 2 - clarificationCount);
      
      for (const question of questionsToUpdate) {
        await supabase
          .from('questions')
          .update({ clarification_required: true })
          .eq('id', question.id);
        clarificationCount++;
      }
    }

    if (reviewCount < 2) {
      const questionsToUpdate = createdQuestions
        .filter(q => !q.clarification_required && !q.requires_review)
        .slice(0, 2 - reviewCount);
      
      for (const question of questionsToUpdate) {
        await supabase
          .from('questions')
          .update({ requires_review: true })
          .eq('id', question.id);
        reviewCount++;
      }
    }

    // Update file status to parsed
    const { error: fileUpdateError } = await supabase
      .from('proposal_files')
      .update({ status: 'parsed' })
      .eq('id', file_id);

    if (fileUpdateError) {
      console.error('Error updating file status:', fileUpdateError);
      throw fileUpdateError;
    }

    // Update proposal status to draft if not already set
    const { error: proposalUpdateError } = await supabase
      .from('proposals')
      .update({ status: 'draft' })
      .eq('id', proposal_id)
      .eq('status', 'draft'); // Only update if still draft

    if (proposalUpdateError) {
      console.error('Error updating proposal status:', proposalUpdateError);
      // Don't throw here as this is not critical
    }

    // Log the agent action
    const { error: logError } = await supabase
      .from('agent_logs')
      .insert({
        agent_name: 'parser_agent',
        action: 'extracted_rfp_questions_section_4',
        proposal_id,
        metadata: {
          sections_created: 1,
          questions_created: createdQuestions.length,
          clarifications_flagged: clarificationCount,
          reviews_flagged: reviewCount,
          file_id,
          processing_time_ms: 1000,
          sections_parsed: ['4.1', '4.2'],
          extraction_method: 'numbered_questions_only'
        }
      });

    if (logError) {
      console.error('Error logging agent action:', logError);
      // Don't throw here as this is not critical
    }

    // Trigger Orchestrator Agent to check for clarification flow
    try {
      const { error: orchestratorError } = await supabase.functions.invoke('orchestrator-agent', {
        body: { 
          proposal_id,
          trigger: 'parser_completed',
          context: {
            sections_created: 1,
            questions_created: createdQuestions.length,
            clarifications_needed: clarificationCount,
            reviews_needed: reviewCount
          }
        }
      });

      if (orchestratorError) {
        console.error('Error triggering orchestrator:', orchestratorError);
        // Log but don't fail the parser
      }
    } catch (orchestratorErr) {
      console.error('Failed to trigger orchestrator:', orchestratorErr);
      // Continue without failing
    }

    console.log(`ParserAgent completed successfully for proposal ${proposal_id} - extracted ${createdQuestions.length} RFP questions from Section 4`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'RFP parsed successfully - Section 4 questions extracted',
        data: {
          proposal_id,
          sections_created: 1,
          questions_created: createdQuestions.length,
          clarifications_flagged: clarificationCount,
          reviews_flagged: reviewCount,
          sections_parsed: ['4.1', '4.2']
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('ParserAgent error:', error);
    
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
