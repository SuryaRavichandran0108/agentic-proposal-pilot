
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

    // Mock sections to create
    const mockSections = [
      { title: "Company Overview", order_index: 1 },
      { title: "Product Requirements", order_index: 2 },
      { title: "Technical Specifications", order_index: 3 },
      { title: "Project Timeline & Budget", order_index: 4 }
    ];

    // Mock questions for each section
    const mockQuestionsBySection = [
      [
        "Describe your company's history and core competencies",
        "What is your annual revenue and number of employees?",
        "Provide references from similar projects"
      ],
      [
        "What are the key features required for this product?",
        "What is the expected user capacity and performance requirements?",
        "Are there any specific compliance requirements?"
      ],
      [
        "What technology stack do you prefer for this solution?",
        "What are the security and data protection requirements?",
        "Do you require cloud deployment or on-premises installation?"
      ],
      [
        "What is the expected project timeline and key milestones?",
        "What is the total budget allocated for this project?",
        "What are the payment terms and schedule?"
      ]
    ];

    // Start transaction by creating sections and questions
    const createdSections = [];
    const createdQuestions = [];
    let clarificationCount = 0;
    let reviewCount = 0;

    for (let i = 0; i < mockSections.length; i++) {
      // Create section
      const { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .insert({
          proposal_id,
          title: mockSections[i].title,
          order_index: mockSections[i].order_index
        })
        .select()
        .single();

      if (sectionError) {
        console.error('Error creating section:', sectionError);
        throw sectionError;
      }

      createdSections.push(sectionData);
      console.log(`Created section: ${sectionData.title}`);

      // Create questions for this section
      const questionsForSection = mockQuestionsBySection[i];
      
      for (let j = 0; j < questionsForSection.length; j++) {
        const questionIndex = i * 3 + j; // Global question index
        const needsClarification = clarificationCount < 2 && Math.random() < 0.3;
        const needsReview = reviewCount < 2 && !needsClarification && Math.random() < 0.3;
        
        if (needsClarification) clarificationCount++;
        if (needsReview) reviewCount++;

        const questionData = {
          section_id: sectionData.id,
          question_text: questionsForSection[j],
          source: 'parsed' as const,
          clarification_required: needsClarification,
          requires_review: needsReview,
          confidence_score: Math.round((Math.random() * 0.35 + 0.6) * 100) / 100 // 0.6 to 0.95
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
        console.log(`Created question: ${question.question_text} (clarification: ${needsClarification}, review: ${needsReview})`);
      }
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
        action: 'extracted_sections_and_questions',
        proposal_id,
        metadata: {
          sections_created: createdSections.length,
          questions_created: createdQuestions.length,
          clarifications_flagged: clarificationCount,
          reviews_flagged: reviewCount,
          file_id,
          processing_time_ms: 1000
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
            sections_created: createdSections.length,
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

    console.log(`ParserAgent completed successfully for proposal ${proposal_id}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'RFP parsed successfully',
        data: {
          proposal_id,
          sections_created: createdSections.length,
          questions_created: createdQuestions.length,
          clarifications_flagged: clarificationCount,
          reviews_flagged: reviewCount
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
