import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { MessageSquare, Send, ShieldX } from 'lucide-react';

export function ClarificationsTab() {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const { profile, isProposalManager } = useAuthContext();
  const queryClient = useQueryClient();

  // Access control - only proposal managers can view this tab
  if (!isProposalManager) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <ShieldX className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-4 text-lg font-medium text-red-600">Access Denied</h3>
          <p className="text-gray-500">Only Proposal Managers can access clarifications</p>
        </CardContent>
      </Card>
    );
  }

  const { data: clarifications, isLoading } = useQuery({
    queryKey: ['clarifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clarifications')
        .select(`
          *,
          questions (
            *,
            sections (
              *,
              proposals (*)
            )
          )
        `)
        .in('status', ['pending', 'sent'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: answeredClarifications } = useQuery({
    queryKey: ['answered-clarifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clarifications')
        .select(`
          *,
          questions (
            *,
            sections (
              *,
              proposals (*)
            )
          )
        `)
        .eq('status', 'answered')
        .order('answered_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  const submitResponseMutation = useMutation({
    mutationFn: async ({ clarificationId, response }: { clarificationId: string; response: string }) => {
      const clarification = clarifications?.find(c => c.id === clarificationId);
      if (!clarification) throw new Error('Clarification not found');

      // Update clarification with answer
      const { error: clarificationError } = await supabase
        .from('clarifications')
        .update({
          answer_text: response,
          status: 'answered',
          answered_at: new Date().toISOString()
        })
        .eq('id', clarificationId);

      if (clarificationError) throw clarificationError;

      // Update the question to mark clarification as answered
      const { error: questionError } = await supabase
        .from('questions')
        .update({
          clarification_answered: true
        })
        .eq('id', clarification.question_id);

      if (questionError) throw questionError;

      // Log the user action
      const { error: logError } = await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'user_input',
          action: 'clarification_answered',
          proposal_id: clarification.questions.sections.proposals.id,
          question_id: clarification.question_id,
          triggered_by_user_id: profile?.id,
          metadata: {
            clarification_id: clarificationId,
            question_id: clarification.question_id,
            user_input: response,
            timestamp: new Date().toISOString()
          }
        });

      if (logError) {
        console.error('Error logging clarification response:', logError);
      }

      // Check if all clarifications for this proposal are now answered
      const { data: remainingClarifications, error: countError } = await supabase
        .from('clarifications')
        .select('id, questions!inner(sections!inner(proposals!inner(id)))')
        .eq('questions.sections.proposals.id', clarification.questions.sections.proposals.id)
        .in('status', ['pending', 'sent']);

      if (countError) {
        console.error('Error checking remaining clarifications:', countError);
        return;
      }

      // If no pending/sent clarifications remain, trigger the orchestrator
      if (remainingClarifications.length === 1) { // This one will be marked as answered
        try {
          const { error: orchestratorError } = await supabase.functions.invoke('orchestrator-agent', {
            body: {
              proposal_id: clarification.questions.sections.proposals.id,
              trigger: 'all_clarifications_answered',
              context: {
                clarifications_answered: true,
                ready_for_content_generation: true
              }
            }
          });

          if (orchestratorError) {
            console.error('Error triggering orchestrator:', orchestratorError);
          } else {
            console.log('Successfully triggered orchestrator for content generation');
          }
        } catch (orchestratorErr) {
          console.error('Failed to trigger orchestrator:', orchestratorErr);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      queryClient.invalidateQueries({ queryKey: ['answered-clarifications'] });
      toast.success('Clarification response submitted successfully!');
      setResponses({});
    },
    onError: (error: any) => {
      console.error('Error submitting clarification response:', error);
      toast.error('Failed to submit response: ' + error.message);
    }
  });

  const handleSubmitResponse = (clarificationId: string) => {
    const response = responses[clarificationId];
    if (!response?.trim()) {
      toast.error('Please provide a response');
      return;
    }
    submitResponseMutation.mutate({ clarificationId, response });
  };

  if (isLoading) {
    return <div>Loading clarifications...</div>;
  }

  const pendingClarifications = clarifications || [];
  const completedClarifications = answeredClarifications || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Clarification Requests</h2>
        <Badge variant="secondary">
          {pendingClarifications.length} pending
        </Badge>
      </div>

      <div className="grid gap-6">
        {pendingClarifications.length === 0 && completedClarifications.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">No clarifications yet</h3>
              <p className="text-gray-500">Upload an RFP to get AI-generated clarification requests</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {pendingClarifications.map((clarification) => (
              <Card key={clarification.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {clarification.questions.sections.proposals.title}
                      </CardTitle>
                      <CardDescription>
                        Section: {clarification.questions.sections.title}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Pending Response
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Original Question:</h4>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                      {clarification.questions.question_text}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Clarification Needed:</h4>
                    <p className="text-gray-700 bg-blue-50 p-3 rounded-lg">
                      {clarification.prompt_text}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium text-gray-900">Your Response:</label>
                    <Textarea
                      value={responses[clarification.id] || ''}
                      onChange={(e) => setResponses(prev => ({
                        ...prev,
                        [clarification.id]: e.target.value
                      }))}
                      placeholder="Provide clarification for this question..."
                      rows={3}
                    />
                    <Button 
                      onClick={() => handleSubmitResponse(clarification.id)}
                      disabled={!responses[clarification.id]?.trim() || submitResponseMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit Response
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {completedClarifications.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Recently Completed Clarifications</h3>
                {completedClarifications.map((clarification) => (
                  <Card key={clarification.id} className="mb-4">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          {clarification.questions.sections.proposals.title}
                        </CardTitle>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Answered
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <span className="font-medium">Question: </span>
                          <span className="text-gray-700">{clarification.questions.question_text}</span>
                        </div>
                        <div>
                          <span className="font-medium">Clarification: </span>
                          <span className="text-gray-700">{clarification.prompt_text}</span>
                        </div>
                        <div>
                          <span className="font-medium">Response: </span>
                          <span className="text-gray-700">{clarification.answer_text}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
