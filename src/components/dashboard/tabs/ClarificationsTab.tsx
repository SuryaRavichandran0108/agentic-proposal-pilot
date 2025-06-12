import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { MessageSquare, Send, ShieldX, AlertCircle, Play, HelpCircle } from 'lucide-react';
import { ClarificationCard } from './ClarificationCard';
import { SubmissionDraftModal } from './SubmissionDraftModal';

export function ClarificationsTab() {
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [submissionDraft, setSubmissionDraft] = useState<{
    message: string;
    count: number;
    clarificationIds: string[];
  } | null>(null);
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

      const { data, error } = await supabase
        .rpc('get_clarifications_for_user');
      
      if (error) {
        console.error('Error fetching clarifications:', error);
        throw error;
      }
      
      console.log('Raw clarifications data from function:', data);
      
      // Filter for the active proposal - show suggested, approved, denied, and submitted clarifications
      const proposalClarifications = data?.filter(clarification => 
        clarification.proposal_id === activeProposalId &&
        clarification.suggested_by === 'agent' &&
        ['suggested', 'approved', 'denied', 'submitted_to_client'].includes(clarification.status)
      ) || [];
      
      console.log('Filtered clarifications for review:', proposalClarifications);
      
      return proposalClarifications;
    },
    enabled: !!activeProposalId
  });

  // Mutation for running ClarificationAgent manually
  const runClarificationAgentMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      console.log('Triggering ClarificationAgent for proposal:', proposalId);
      
      const { data, error } = await supabase.functions.invoke('clarification-agent', {
        body: { proposal_id: proposalId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      toast.success('ClarificationAgent successfully ran. Suggestions have been generated.');
      console.log('ClarificationAgent completed:', data);
    },
    onError: (error: any) => {
      console.error('Error running ClarificationAgent:', error);
      toast.error('ClarificationAgent failed to run. Please try again or check the agent logs.');
    }
  });

  // Mutation for updating clarification status
  const updateClarificationMutation = useMutation({
    mutationFn: async ({ 
      clarificationId, 
      status, 
      editedText 
    }: { 
      clarificationId: string; 
      status: 'approved' | 'denied'; 
      editedText?: string;
    }) => {
      const updateData: any = {
        status,
        approved_by_user_id: profile?.id
      };

      if (editedText) {
        updateData.edited_prompt_text = editedText;
      }

      const { error } = await supabase
        .from('clarifications')
        .update(updateData)
        .eq('id', clarificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      toast.success('Clarification updated successfully!');
    },
    onError: (error: any) => {
      console.error('Error updating clarification:', error);
      toast.error('Failed to update clarification: ' + error.message);
    }
  });

  // Mutation for editing clarification text
  const editClarificationMutation = useMutation({
    mutationFn: async ({ 
      clarificationId, 
      editedText 
    }: { 
      clarificationId: string; 
      editedText: string;
    }) => {
      const { error } = await supabase
        .from('clarifications')
        .update({ edited_prompt_text: editedText })
        .eq('id', clarificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      toast.success('Clarification text updated!');
    },
    onError: (error: any) => {
      console.error('Error updating clarification text:', error);
      toast.error('Failed to update clarification text: ' + error.message);
    }
  });

  // Mutation for moving clarification back to review
  const moveBackToReviewMutation = useMutation({
    mutationFn: async (clarificationId: string) => {
      const { error } = await supabase
        .from('clarifications')
        .update({ 
          status: 'approved',
          submission_id: null
        })
        .eq('id', clarificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      toast.success('Clarification moved back to review!');
    },
    onError: (error: any) => {
      console.error('Error moving clarification back to review:', error);
      toast.error('Failed to move clarification back to review: ' + error.message);
    }
  });

  // Enhanced mutation for confirming submission with passcode support
  const confirmSubmissionMutation = useMutation({
    mutationFn: async ({ clarificationIds, passcode }: { 
      clarificationIds: string[];
      passcode?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('clarification-submission-agent', {
        body: {
          proposal_id: activeProposalId,
          clarification_ids: clarificationIds,
          passcode
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      toast.success(`${data.clarifications_count} clarifications submitted successfully!`);
      setSubmissionDraft(null);
    },
    onError: (error: any) => {
      console.error('Error confirming submission:', error);
      toast.error('Failed to confirm submission: ' + error.message);
    }
  });

  const handleApprove = (clarificationId: string) => {
    updateClarificationMutation.mutate({ clarificationId, status: 'approved' });
  };

  const handleDeny = (clarificationId: string) => {
    updateClarificationMutation.mutate({ clarificationId, status: 'denied' });
  };

  const handleEdit = (clarificationId: string, editedText: string) => {
    editClarificationMutation.mutate({ clarificationId, editedText });
  };

  const handleMoveBackToReview = (clarificationId: string) => {
    moveBackToReviewMutation.mutate(clarificationId);
  };

  const handleRunClarificationAgent = () => {
    if (activeProposalId) {
      runClarificationAgentMutation.mutate(activeProposalId);
    }
  };

  // Enhanced draft message generation with professional template
  const handlePrepareSubmission = async () => {
    const approvedClarifications = clarifications?.filter(c => c.status === 'approved') || [];
    
    if (approvedClarifications.length === 0) {
      toast.error('No approved clarifications to submit');
      return;
    }

    try {
      const activeProposal = proposals?.find(p => p.id === activeProposalId);
      if (!activeProposal) return;

      const clarificationQuestions = approvedClarifications
        .map((c, index) => {
          const questionText = c.edited_prompt_text || c.prompt_text;
          return `${index + 1}. ${questionText}`;
        })
        .join('\n\n');

      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const draftMessage = `Subject: Clarification Request – ${activeProposal.client_name} / ${activeProposal.title}

Dear ${activeProposal.client_name} Team,

We have reviewed the RFP titled "${activeProposal.title}" and identified several points that require clarification to ensure a complete and accurate response.

We respectfully request your confirmation and additional details on the following items:

${clarificationQuestions}

For your convenience, we have prepared a structured response form that will streamline the clarification process. You will receive a secure link to this form upon confirmation of this request.

We appreciate your timely feedback and remain committed to submitting a thorough and compliant response that meets all requirements outlined in your RFP.

Please don't hesitate to contact us if you need any additional information or have questions about this clarification request.

Sincerely,

${profile?.name || 'Proposal Manager'}
${activeProposal.client_name} Response Team
Email: ${profile?.email || 'contact@company.com'}
Date: ${currentDate}

---
This clarification request was generated on ${currentDate} and contains ${approvedClarifications.length} question${approvedClarifications.length !== 1 ? 's' : ''} for your review.`;

      setSubmissionDraft({
        message: draftMessage,
        count: approvedClarifications.length,
        clarificationIds: approvedClarifications.map(c => c.clarification_id)
      });
    } catch (error: any) {
      console.error('Error preparing submission:', error);
      toast.error('Failed to prepare submission: ' + error.message);
    }
  };

  const handleConfirmSubmission = (options: { passcode?: string } = {}) => {
    if (submissionDraft) {
      confirmSubmissionMutation.mutate({ 
        clarificationIds: submissionDraft.clarificationIds,
        passcode: options.passcode
      });
    }
  };

  // Enhanced status badge function
  const getStatusBadge = (status: string, hasResponse?: boolean) => {
    switch (status) {
      case 'suggested':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending Review</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case 'denied':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Denied</Badge>;
      case 'submitted_to_client':
        if (hasResponse) {
          return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Client Responded</Badge>;
        }
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Awaiting Client Response</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const activeProposal = proposals?.find(p => p.id === activeProposalId);

  const suggestedClarifications = clarifications?.filter(c => c.status === 'suggested') || [];
  const approvedClarifications = clarifications?.filter(c => c.status === 'approved') || [];
  const deniedClarifications = clarifications?.filter(c => c.status === 'denied') || [];
  const submittedClarifications = clarifications?.filter(c => c.status === 'submitted_to_client') || [];

  const hasApprovedClarifications = approvedClarifications.length > 0;
  const isUpdating = updateClarificationMutation.isPending || 
                   editClarificationMutation.isPending || 
                   moveBackToReviewMutation.isPending;

  // Determine if ClarificationAgent button should be shown
  const shouldShowClarificationAgentButton = clarifications && (
    clarifications.length === 0 || // No clarifications exist
    clarifications.every(c => ['denied', 'answered', 'submitted_to_client'].includes(c.status)) // All are denied/answered/submitted
  );

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

  const allClarifications = clarifications || [];

  return (
    <TooltipProvider>
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
            {shouldShowClarificationAgentButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleRunClarificationAgent}
                      disabled={runClarificationAgentMutation.isPending}
                      variant="outline"
                      className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {runClarificationAgentMutation.isPending ? 'Running...' : 'Run ClarificationAgent'}
                    </Button>
                    <HelpCircle className="h-4 w-4 text-gray-400" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Run ClarificationAgent to scan the parsed questions for vague language and generate clarification prompts.</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Badge variant="secondary">
              {suggestedClarifications.length} pending review
            </Badge>
            {approvedClarifications.length > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {approvedClarifications.length} approved
              </Badge>
            )}
          </div>
        </div>

        {hasApprovedClarifications && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-green-900">Ready to Submit</h3>
                <p className="text-sm text-green-700">
                  You have {approvedClarifications.length} approved clarification{approvedClarifications.length !== 1 ? 's' : ''} ready to send to the client.
                </p>
              </div>
              <Button
                onClick={handlePrepareSubmission}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="mr-2 h-4 w-4" />
                Submit Clarifications to Client
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {allClarifications.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium">No clarifications available for this proposal</h3>
                <p className="text-gray-500">
                  {proposals?.length === 0 
                    ? 'Upload an RFP to get AI-generated clarification requests'
                    : shouldShowClarificationAgentButton 
                      ? 'Click "Run ClarificationAgent" to generate clarification prompts from parsed questions'
                      : 'All clarification requests for this proposal have been addressed'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Suggested clarifications for review */}
              {suggestedClarifications.map((clarification) => (
                <ClarificationCard
                  key={clarification.clarification_id}
                  clarification={clarification}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  onEdit={handleEdit}
                  onMoveBackToReview={undefined}
                  isUpdating={isUpdating}
                  getStatusBadge={getStatusBadge}
                />
              ))}

              {/* Enhanced sections with response status */}
              {(approvedClarifications.length > 0 || deniedClarifications.length > 0 || submittedClarifications.length > 0) && (
                <div className="space-y-4">
                  {approvedClarifications.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-green-700">Approved Clarifications ({approvedClarifications.length})</h3>
                      <div className="space-y-4">
                        {approvedClarifications.map((clarification) => (
                          <ClarificationCard
                            key={clarification.clarification_id}
                            clarification={clarification}
                            onApprove={handleApprove}
                            onDeny={handleDeny}
                            onEdit={handleEdit}
                            onMoveBackToReview={undefined}
                            isUpdating={isUpdating}
                            getStatusBadge={getStatusBadge}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {submittedClarifications.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-blue-700">
                        Submitted to Client ({submittedClarifications.length})
                        {submittedClarifications.some(c => c.response_text) && (
                          <span className="text-purple-600 ml-2">
                            • {submittedClarifications.filter(c => c.response_text).length} Response{submittedClarifications.filter(c => c.response_text).length !== 1 ? 's' : ''} Received
                          </span>
                        )}
                      </h3>
                      <div className="space-y-4">
                        {submittedClarifications.map((clarification) => (
                          <ClarificationCard
                            key={clarification.clarification_id}
                            clarification={clarification}
                            onApprove={handleApprove}
                            onDeny={handleDeny}
                            onEdit={handleEdit}
                            onMoveBackToReview={handleMoveBackToReview}
                            isUpdating={isUpdating}
                            getStatusBadge={getStatusBadge}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {deniedClarifications.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-red-700">Denied Clarifications ({deniedClarifications.length})</h3>
                      <div className="space-y-4">
                        {deniedClarifications.map((clarification) => (
                          <ClarificationCard
                            key={clarification.clarification_id}
                            clarification={clarification}
                            onApprove={handleApprove}
                            onDeny={handleDeny}
                            onEdit={handleEdit}
                            onMoveBackToReview={undefined}
                            isUpdating={isUpdating}
                            getStatusBadge={getStatusBadge}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <SubmissionDraftModal
          isOpen={!!submissionDraft}
          onClose={() => setSubmissionDraft(null)}
          onConfirm={handleConfirmSubmission}
          draftMessage={submissionDraft?.message || ''}
          clarificationsCount={submissionDraft?.count || 0}
          isConfirming={confirmSubmissionMutation.isPending}
          proposalTitle={activeProposal?.title || ''}
          clientName={activeProposal?.client_name || ''}
          managerName={profile?.name}
          companyName="Your Organization"
        />
      </div>
    </TooltipProvider>
  );
}
