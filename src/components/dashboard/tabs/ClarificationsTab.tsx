
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

  // Fetch all proposals
  const { data: proposals, isLoading: isProposalsLoading, error: proposalsError } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id as proposal_id, title as proposal_title, client_name');

      if (error) {
        console.error('Error fetching proposals:', error);
        throw error;
      }
      return data as Proposal[];
    },
  });

  // Fetch clarifications based on selected proposal and filter
  const { data: clarifications, isLoading, error, refetch: refetchClarifications } = useQuery({
    queryKey: ['clarifications', selectedProposalId, filterStatus],
    queryFn: async () => {
      if (!selectedProposalId) return [];

      // Get submission IDs for the proposal first
      const { data: submissionIds, error: submissionError } = await supabase
        .from('clarification_submissions')
        .select('id')
        .eq('proposal_id', selectedProposalId);

      if (submissionError) {
        console.error('Error fetching submissions:', submissionError);
        throw submissionError;
      }

      if (!submissionIds || submissionIds.length === 0) {
        return [];
      }

      const submissionIdsList = submissionIds.map(sub => sub.id);

      let query = supabase
        .from('clarifications')
        .select(`
          id,
          id as clarification_id,
          submission_id,
          prompt_text,
          edited_prompt_text,
          response_text,
          status,
          created_at,
          answered_at,
          answered_by_email,
          questions!inner(
            question_text,
            sections!inner(
              title
            )
          )
        `)
        .in('submission_id', submissionIdsList);

      if (filterStatus) {
        query = query.eq('status', filterStatus as 'suggested' | 'approved' | 'denied' | 'submitted_to_client' | 'answered');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching clarifications:', error);
        throw error;
      }

      // Transform the data to match our interface
      const transformedData = data?.map(item => ({
        id: item.id,
        clarification_id: item.clarification_id,
        submission_id: item.submission_id,
        prompt_text: item.prompt_text,
        edited_prompt_text: item.edited_prompt_text,
        response_text: item.response_text,
        status: item.status,
        suggested_by: 'agent', // Default value
        created_at: item.created_at,
        answered_at: item.answered_at,
        answered_by_email: item.answered_by_email,
        question_text: (item.questions as any)?.question_text || '',
        section_title: (item.questions as any)?.sections?.title || ''
      })) || [];

      return transformedData as Clarification[];
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
              <Select onValueChange={setFilterStatus}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
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
              ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {proposalClarifications.map((clarification) => (
                    <ClarificationCard
                      key={clarification.id}
                      clarification={clarification}
                      onViewSubmission={() => handleOpenSubmissionModal(clarification.submission_id)}
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
        submissionId={selectedSubmissionId || ''}
      />
    </div>
  );
}
