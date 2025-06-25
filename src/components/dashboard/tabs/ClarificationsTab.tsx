import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClarificationCard } from './ClarificationCard';
import { SubmissionDraftModal } from './SubmissionDraftModal';
import { ContentAgentRerunButton } from '../ContentAgentRerunButton';
import { 
  MessageSquare, 
  Send, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Filter,
  RefreshCw
} from 'lucide-react';

interface Proposal {
  proposal_id: string;
  proposal_title: string;
  client_name: string;
}

interface Clarification {
  id: string;
  clarification_id: string;
  submission_id: string;
  prompt_text: string;
  edited_prompt_text: string | null;
  response_text: string | null;
  status: 'suggested' | 'approved' | 'denied' | 'submitted_to_client' | 'answered';
  suggested_by: string;
  created_at: string;
  answered_at: string | null;
  answered_by_email: string | null;
  question_text: string;
  section_title: string;
}

interface Submission {
  id: string;
  proposal_id: string;
  created_at: string;
  expires_at: string;
  passcode: string | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ClarificationsTab() {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<{
    approvedClarifications: Clarification[];
    draftMessage: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all proposals
  const { data: proposals, isLoading: isProposalsLoading, error: proposalsError } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, title, client_name');

      if (error) {
        console.error('Error fetching proposals:', error);
        throw error;
      }

      // Map the data to match our interface
      return (data || []).map(item => ({
        proposal_id: item.id,
        proposal_title: item.title,
        client_name: item.client_name
      })) as Proposal[];
    },
  });

  // Fetch clarifications based on selected proposal and filter
  const { data: clarifications, isLoading, error, refetch: refetchClarifications } = useQuery({
    queryKey: ['clarifications', selectedProposalId, filterStatus],
    queryFn: async () => {
      if (!selectedProposalId) return [];

      // Build the query to fetch clarifications with proper joins
      let query = supabase
        .from('clarifications')
        .select(`
          id,
          prompt_text,
          edited_prompt_text,
          response_text,
          status,
          created_at,
          answered_at,
          answered_by_email,
          question_id,
          questions!inner(
            question_text,
            section_id,
            sections!inner(
              title,
              proposal_id
            )
          )
        `)
        .eq('questions.sections.proposal_id', selectedProposalId)
        .in('status', ['suggested', 'approved', 'denied', 'submitted_to_client', 'answered']);

      // Apply status filter if specified - fix the type issue here
      if (filterStatus && filterStatus !== 'all') {
        const validStatuses = ['suggested', 'approved', 'denied', 'submitted_to_client', 'answered'] as const;
        type ValidStatus = typeof validStatuses[number];
        
        if (validStatuses.includes(filterStatus as ValidStatus)) {
          query = query.eq('status', filterStatus as ValidStatus);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching clarifications:', error);
        throw error;
      }

      // Transform the data to match our interface
      const transformedData = (data || []).map(item => {
        const question = item.questions as any;
        const section = question?.sections;
        
        return {
          id: item.id,
          clarification_id: item.id,
          submission_id: '', // Will be populated when needed
          prompt_text: item.prompt_text,
          edited_prompt_text: item.edited_prompt_text,
          response_text: item.response_text,
          status: item.status,
          suggested_by: 'agent', // Default value
          created_at: item.created_at,
          answered_at: item.answered_at,
          answered_by_email: item.answered_by_email,
          question_text: question?.question_text || '',
          section_title: section?.title || ''
        };
      }) as Clarification[];

      return transformedData;
    },
    enabled: !!selectedProposalId,
  });

  const selectedProposal = proposals?.find(p => p.proposal_id === selectedProposalId);
  const proposalClarifications = clarifications || [];

  const handleProposalChange = (proposalId: string) => {
    setSelectedProposalId(proposalId);
  };

  const handleOpenSubmissionModal = (submissionId: string) => {
    setSelectedSubmissionId(submissionId);
    setIsSubmissionModalOpen(true);
  };

  const handleCloseSubmissionModal = () => {
    setIsSubmissionModalOpen(false);
    setSelectedSubmissionId(null);
    setPendingSubmission(null);
  };

  // Check if all clarifications are approved and trigger modal
  const checkAndTriggerSubmissionModal = async (updatedClarifications: Clarification[]) => {
    const allClarifications = updatedClarifications.filter(c => 
      ['suggested', 'approved', 'denied'].includes(c.status)
    );
    const approvedClarifications = allClarifications.filter(c => c.status === 'approved');
    
    // Only trigger if we have approved clarifications and no pending ones
    if (approvedClarifications.length > 0 && 
        allClarifications.every(c => c.status === 'approved') &&
        !pendingSubmission) {
      
      // Generate draft message
      const draftMessage = generateSubmissionDraftMessage(approvedClarifications, selectedProposal);
      
      setPendingSubmission({
        approvedClarifications,
        draftMessage
      });
      setIsSubmissionModalOpen(true);
    }
  };

  const generateSubmissionDraftMessage = (clarifications: Clarification[], proposal: Proposal | undefined) => {
    if (!proposal) return '';
    
    const clarificationList = clarifications
      .map((c, index) => `${index + 1}. ${c.edited_prompt_text || c.prompt_text}`)
      .join('\n\n');

    return `Subject: Clarification Request - ${proposal.proposal_title}

Dear ${proposal.client_name} Team,

We are preparing our response to your RFP for "${proposal.proposal_title}" and would appreciate your clarification on the following points:

${clarificationList}

Please provide your responses at your earliest convenience. Your clarifications will help us deliver the most accurate and comprehensive proposal possible.

Thank you for your time and consideration.

Best regards,
[Your Name]
[Your Company]`;
  };

  // Handle submission to client
  const handleSubmitToClient = async (options: { passcode?: string }) => {
    if (!pendingSubmission || !selectedProposal) return;

    setIsSubmitting(true);
    
    try {
      // Create clarification submission record
      const { data: submission, error: submissionError } = await supabase
        .from('clarification_submissions')
        .insert({
          proposal_id: selectedProposal.proposal_id,
          user_id: (await supabase.auth.getUser()).data.user?.id || '',
          draft_message: pendingSubmission.draftMessage,
          method: 'email',
          passcode: options.passcode || null,
          submitted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (submissionError) {
        console.error('Error creating submission:', submissionError);
        toast.error('Failed to create submission');
        return;
      }

      // Update all approved clarifications
      const clarificationIds = pendingSubmission.approvedClarifications.map(c => c.id);
      const { error: updateError } = await supabase
        .from('clarifications')
        .update({
          status: 'submitted_to_client',
          submission_id: submission.id
        })
        .in('id', clarificationIds);

      if (updateError) {
        console.error('Error updating clarifications:', updateError);
        toast.error('Failed to update clarifications');
        return;
      }

      toast.success(`Clarifications submitted to ${selectedProposal.client_name}`);
      refetchClarifications();
      handleCloseSubmissionModal();
      
    } catch (error) {
      console.error('Error submitting clarifications:', error);
      toast.error('Failed to submit clarifications');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Updated approval handler
  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clarifications')
        .update({ status: 'approved' })
        .eq('id', id);

      if (error) {
        console.error('Error approving clarification:', error);
        toast.error('Failed to approve clarification');
        return;
      }

      toast.success('Clarification approved');
      
      // Refetch and check if all are approved
      const { data: updatedClarifications } = await refetchClarifications();
      if (updatedClarifications) {
        await checkAndTriggerSubmissionModal(updatedClarifications);
      }
    } catch (error) {
      console.error('Error approving clarification:', error);
      toast.error('Failed to approve clarification');
    }
  };

  const handleDeny = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clarifications')
        .update({ status: 'denied' })
        .eq('id', id);

      if (error) {
        console.error('Error denying clarification:', error);
        toast.error('Failed to deny clarification');
        return;
      }

      toast.success('Clarification denied');
      refetchClarifications();
    } catch (error) {
      console.error('Error denying clarification:', error);
      toast.error('Failed to deny clarification');
    }
  };

  const handleEdit = async (id: string, text: string) => {
    try {
      const { error } = await supabase
        .from('clarifications')
        .update({ edited_prompt_text: text })
        .eq('id', id);

      if (error) {
        console.error('Error editing clarification:', error);
        toast.error('Failed to update clarification');
        return;
      }

      toast.success('Clarification updated');
      refetchClarifications();
    } catch (error) {
      console.error('Error editing clarification:', error);
      toast.error('Failed to update clarification');
    }
  };

  const handleMoveBackToReview = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clarifications')
        .update({ status: 'suggested' })
        .eq('id', id);

      if (error) {
        console.error('Error moving clarification back to review:', error);
        toast.error('Failed to move clarification back to review');
        return;
      }

      toast.success('Clarification moved back to review');
      refetchClarifications();
    } catch (error) {
      console.error('Error moving clarification back to review:', error);
      toast.error('Failed to move clarification back to review');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Clarification Management
              </CardTitle>
              <CardDescription>
                Manage clarification requests and track client responses across all proposals
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => refetchClarifications()}
                variant="outline"
                size="sm"
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="proposal-select">Select Proposal</Label>
              <Select onValueChange={handleProposalChange}>
                <SelectTrigger id="proposal-select">
                  <SelectValue placeholder="Select a proposal" />
                </SelectTrigger>
                <SelectContent>
                  {proposals?.map((proposal) => (
                    <SelectItem key={proposal.proposal_id} value={proposal.proposal_id}>
                      {proposal.proposal_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select onValueChange={(value) => setFilterStatus(value === 'all' ? null : value)}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="suggested">Suggested</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="submitted_to_client">Submitted to Client</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedProposal && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <h3 className="font-semibold text-blue-900">
                    {selectedProposal.proposal_title}
                  </h3>
                  <p className="text-sm text-blue-700">
                    Client: {selectedProposal.client_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ContentAgentRerunButton 
                    proposalId={selectedProposal.proposal_id}
                    disabled={isLoading}
                  />
                  <Badge variant="secondary">
                    {proposalClarifications.length} clarification{proposalClarifications.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>

              {/* Show ready-to-submit banner if all clarifications are approved */}
              {proposalClarifications.length > 0 && 
               proposalClarifications.filter(c => ['suggested', 'approved', 'denied'].includes(c.status)).every(c => c.status === 'approved') &&
               !pendingSubmission && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    All clarifications approved! 
                    <Button 
                      variant="link" 
                      className="ml-2 p-0 h-auto text-green-700 underline"
                      onClick={() => {
                        const approvedClarifications = proposalClarifications.filter(c => c.status === 'approved');
                        const draftMessage = generateSubmissionDraftMessage(approvedClarifications, selectedProposal);
                        setPendingSubmission({ approvedClarifications, draftMessage });
                        setIsSubmissionModalOpen(true);
                      }}
                    >
                      Submit to Client
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to load clarifications. Please try again.
                  </AlertDescription>
                </Alert>
              ) : proposalClarifications.length === 0 ? (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    No clarifications found for this proposal{filterStatus ? ` with status "${filterStatus}"` : ""}.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {proposalClarifications.map((clarification) => (
                    <ClarificationCard
                      key={clarification.id}
                      clarification={clarification}
                      onApprove={handleApprove}
                      onDeny={handleDeny}
                      onEdit={handleEdit}
                      onMoveBackToReview={handleMoveBackToReview}
                      onViewSubmission={() => handleOpenSubmissionModal(clarification.submission_id)}
                      isUpdating={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedProposalId && !isProposalsLoading && (
            <Alert className="mt-4">
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Select a proposal to view clarification requests.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <SubmissionDraftModal
        isOpen={isSubmissionModalOpen}
        onClose={handleCloseSubmissionModal}
        onConfirm={handleSubmitToClient}
        submissionId={selectedSubmissionId || ''}
        draftMessage={pendingSubmission?.draftMessage || ''}
        clarificationsCount={pendingSubmission?.approvedClarifications.length || 0}
        isConfirming={isSubmitting}
        proposalTitle={selectedProposal?.proposal_title || ''}
        clientName={selectedProposal?.client_name || ''}
      />
    </div>
  );
}
