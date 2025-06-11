
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { MessageSquare, Send, ShieldX, AlertCircle } from 'lucide-react';

export function ClarificationsTab() {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
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

  // Fetch user's proposals to get the active one
  const { data: proposals } = useQuery({
    queryKey: ['user-proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, title, client_name, status')
        .eq('created_by', profile?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id
  });

  // Auto-select the first proposal if none is selected
  React.useEffect(() => {
    if (proposals && proposals.length > 0 && !activeProposalId) {
      setActiveProposalId(proposals[0].id);
    }
  }, [proposals, activeProposalId]);

  // Fetch clarifications for the active proposal with improved query
  const { data: clarifications, isLoading, error } = useQuery({
    queryKey: ['clarifications', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      console.log('Fetching clarifications for proposal:', activeProposalId);

      // First, let's get all clarifications with the proper join
      const { data, error } = await supabase
        .from('clarifications')
        .select(`
          id,
          prompt_text,
          status,
          created_at,
          suggested_by,
          questions!inner (
            id,
            question_text,
            sections!inner (
              id,
              title,
              proposal_id
            )
          )
        `)
        .eq('suggested_by', 'agent')
        .eq('questions.sections.proposal_id', activeProposalId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching clarifications:', error);
        throw error;
      }
      
      console.log('Raw clarifications data:', data);
      
      // Filter to only show pending clarifications (not answered or rejected)
      const pendingClarifications = data?.filter(clarification => 
        clarification.status === 'pending'
      ) || [];
      
      console.log('Filtered pending clarifications:', pendingClarifications);
      console.log('Total clarifications found:', data?.length);
      console.log('Pending clarifications found:', pendingClarifications.length);
      
      return pendingClarifications;
    },
    enabled: !!activeProposalId
  });

  // Fetch answered clarifications for display
  const { data: answeredClarifications } = useQuery({
    queryKey: ['answered-clarifications', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      const { data, error } = await supabase
        .from('clarifications')
        .select(`
          id,
          prompt_text,
          answer_text,
          answered_at,
          questions!inner (
            id,
            question_text,
            sections!inner (
              proposal_id
            )
          )
        `)
        .eq('status', 'answered')
        .eq('questions.sections.proposal_id', activeProposalId)
        .order('answered_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      console.log('Answered clarifications:', data);
      return data || [];
    },
    enabled: !!activeProposalId
  });

  // Check if clarifications exist but aren't showing
  const { data: allClarificationsForProposal } = useQuery({
    queryKey: ['all-clarifications-debug', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      const { data, error } = await supabase
        .from('clarifications')
        .select(`
          id,
          status,
          suggested_by,
          questions!inner (
            sections!inner (
              proposal_id
            )
          )
        `)
        .eq('questions.sections.proposal_id', activeProposalId);
      
      if (error) {
        console.error('Debug query error:', error);
        return [];
      }
      
      console.log('ALL clarifications for proposal (debug):', data);
      return data || [];
    },
    enabled: !!activeProposalId
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
        .eq('id', clarification.questions.id);

      if (questionError) throw questionError;

      // Log the user action
      const { error: logError } = await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'user_input',
          action: 'clarification_answered',
          proposal_id: activeProposalId!,
          question_id: clarification.questions.id,
          triggered_by_user_id: profile?.id,
          metadata: {
            clarification_id: clarificationId,
            question_id: clarification.questions.id,
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
        .select('id, questions!inner(sections!inner(proposal_id))')
        .eq('questions.sections.proposal_id', activeProposalId!)
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
              proposal_id: activeProposalId!,
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

  const activeProposal = proposals?.find(p => p.id === activeProposalId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading clarifications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-4 text-lg font-medium text-red-600">Error Loading Clarifications</h3>
          <p className="text-gray-500 mt-2">
            {error instanceof Error ? error.message : 'Unable to fetch clarifications. Please check your permissions.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const pendingClarifications = clarifications || [];
  const completedClarifications = answeredClarifications || [];
  const allClarifications = allClarificationsForProposal || [];

  // Check if there are clarifications in the database but none are showing
  const hasHiddenClarifications = allClarifications.length > 0 && pendingClarifications.length === 0 && completedClarifications.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clarification Requests</h2>
          {activeProposal && (
            <p className="text-gray-600 mt-1">
              {activeProposal.title} - {activeProposal.client_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {proposals && proposals.length > 1 && (
            <select
              value={activeProposalId || ''}
              onChange={(e) => setActiveProposalId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {proposals.map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.title}
                </option>
              ))}
            </select>
          )}
          <Badge variant="secondary">
            {pendingClarifications.length} pending
          </Badge>
          {allClarifications.length > 0 && (
            <Badge variant="outline">
              {allClarifications.length} total in DB
            </Badge>
          )}
        </div>
      </div>

      {hasHiddenClarifications && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="text-amber-800 font-medium">
                ⚠ Clarifications exist in Supabase but could not be loaded — check query logic.
              </span>
            </div>
            <p className="text-amber-700 text-sm mt-1">
              Found {allClarifications.length} clarifications in database for this proposal, but none are displaying.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {pendingClarifications.length === 0 && completedClarifications.length === 0 && !hasHiddenClarifications ? (
          <Card>
            <CardContent className="text-center py-12">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">No clarifications available for this proposal</h3>
              <p className="text-gray-500">
                {proposals?.length === 0 
                  ? 'Upload an RFP to get AI-generated clarification requests'
                  : 'All clarification requests for this proposal have been addressed'
                }
              </p>
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
                        Clarification Required
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
                          Clarification Completed
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
