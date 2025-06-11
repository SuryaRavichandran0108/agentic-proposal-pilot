
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

  // Fetch clarifications using the secure function
  const { data: clarifications, isLoading, error } = useQuery({
    queryKey: ['clarifications', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      console.log('Fetching clarifications for proposal:', activeProposalId);

      // Use the secure function to get flattened clarification data
      const { data, error } = await supabase
        .rpc('get_clarifications_for_user');
      
      if (error) {
        console.error('Error fetching clarifications:', error);
        throw error;
      }
      
      console.log('Raw clarifications data from function:', data);
      
      // Filter for the active proposal and pending status
      const proposalClarifications = data?.filter(clarification => 
        clarification.proposal_id === activeProposalId &&
        clarification.status === 'pending' &&
        clarification.suggested_by === 'agent'
      ) || [];
      
      console.log('Filtered pending clarifications:', proposalClarifications);
      console.log('Total clarifications found:', data?.length);
      console.log('Pending clarifications for proposal:', proposalClarifications.length);
      
      return proposalClarifications;
    },
    enabled: !!activeProposalId
  });

  // Fetch answered clarifications for display
  const { data: answeredClarifications } = useQuery({
    queryKey: ['answered-clarifications', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      const { data, error } = await supabase
        .rpc('get_clarifications_for_user');
      
      if (error) throw error;
      
      // Filter for answered clarifications for this proposal
      const answeredForProposal = data?.filter(clarification =>
        clarification.proposal_id === activeProposalId &&
        clarification.status === 'answered'
      ).slice(0, 5) || [];
      
      console.log('Answered clarifications:', answeredForProposal);
      return answeredForProposal;
    },
    enabled: !!activeProposalId
  });

  // Debug query to check all clarifications
  const { data: allClarificationsForProposal } = useQuery({
    queryKey: ['all-clarifications-debug', activeProposalId],
    queryFn: async () => {
      if (!activeProposalId) return [];

      const { data, error } = await supabase
        .rpc('get_clarifications_for_user');
      
      if (error) {
        console.error('Debug query error:', error);
        return [];
      }
      
      const proposalClarifications = data?.filter(clarification =>
        clarification.proposal_id === activeProposalId
      ) || [];
      
      console.log('ALL clarifications for proposal (debug):', proposalClarifications);
      return proposalClarifications;
    },
    enabled: !!activeProposalId
  });

  const submitResponseMutation = useMutation({
    mutationFn: async ({ clarificationId, response }: { clarificationId: string; response: string }) => {
      const clarification = clarifications?.find(c => c.clarification_id === clarificationId);
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
          proposal_id: activeProposalId!,
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
        .rpc('get_clarifications_for_user');

      if (countError) {
        console.error('Error checking remaining clarifications:', countError);
        return;
      }

      const pendingForProposal = remainingClarifications?.filter(c =>
        c.proposal_id === activeProposalId! &&
        c.status === 'pending'
      ) || [];

      // If no pending clarifications remain, trigger the orchestrator
      if (pendingForProposal.length === 1) { // This one will be marked as answered
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
              <Card key={clarification.clarification_id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        Clarification Required
                      </CardTitle>
                      <CardDescription>
                        Section: {clarification.section_title}
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
                      {clarification.question_text}
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
                      value={responses[clarification.clarification_id] || ''}
                      onChange={(e) => setResponses(prev => ({
                        ...prev,
                        [clarification.clarification_id]: e.target.value
                      }))}
                      placeholder="Provide clarification for this question..."
                      rows={3}
                    />
                    <Button 
                      onClick={() => handleSubmitResponse(clarification.clarification_id)}
                      disabled={!responses[clarification.clarification_id]?.trim() || submitResponseMutation.isPending}
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
                  <Card key={clarification.clarification_id} className="mb-4">
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
                          <span className="text-gray-700">{clarification.question_text}</span>
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
