
import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { Download, Send, CheckCircle } from 'lucide-react';

export function ProposalBuilderTab() {
  const { profile } = useAuthContext();

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals-ready-for-submission'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          sections (
            *,
            questions (
              *,
              answers (*),
              review_assignments (*)
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const submitProposalMutation = useMutation({
    mutationFn: async ({ 
      proposalId, 
      submittedTo, 
      format 
    }: { 
      proposalId: string; 
      submittedTo: string; 
      format: 'PDF' | 'DOCX' | 'ZIP' 
    }) => {
      // Create submission record
      const { error: submissionError } = await supabase
        .from('submissions')
        .insert({
          proposal_id: proposalId,
          submitted_by_user_id: profile?.id,
          submitted_to: submittedTo,
          format,
          status: 'submitted'
        });

      if (submissionError) throw submissionError;

      // Update proposal status
      const { error: proposalError } = await supabase
        .from('proposals')
        .update({ status: 'submitted' })
        .eq('id', proposalId);

      if (proposalError) throw proposalError;

      // Log submission
      await supabase.from('agent_logs').insert({
        agent_name: 'SubmissionAgent',
        action: 'Proposal submitted successfully',
        proposal_id: proposalId,
        triggered_by_user_id: profile?.id,
        metadata: { format, submitted_to: submittedTo }
      });
    },
    onSuccess: () => {
      toast.success('Proposal submitted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const getProposalCompletionStatus = (proposal: any) => {
    const allQuestions = proposal.sections?.flatMap((s: any) => s.questions) || [];
    const questionsWithAnswers = allQuestions.filter((q: any) => q.answers?.length > 0);
    const questionsNeedingReview = allQuestions.filter((q: any) => q.requires_review);
    const reviewedQuestions = questionsNeedingReview.filter((q: any) => q.reviewed);
    
    return {
      total: allQuestions.length,
      answered: questionsWithAnswers.length,
      needingReview: questionsNeedingReview.length,
      reviewed: reviewedQuestions.length,
      isComplete: questionsWithAnswers.length === allQuestions.length && 
                  reviewedQuestions.length === questionsNeedingReview.length
    };
  };

  if (isLoading) {
    return <div>Loading proposals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Proposal Builder</h2>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          Export Template
        </Button>
      </div>

      <div className="grid gap-6">
        {proposals?.map((proposal) => {
          const status = getProposalCompletionStatus(proposal);
          
          return (
            <Card key={proposal.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{proposal.title}</CardTitle>
                    <CardDescription>
                      Client: {proposal.client_name}
                      {proposal.due_date && ` • Due: ${new Date(proposal.due_date).toLocaleDateString()}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={proposal.status === 'submitted' ? 'default' : 'secondary'}>
                      {proposal.status}
                    </Badge>
                    {status.isComplete && proposal.status !== 'submitted' && (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Ready for Submission
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-medium">{status.answered}/{status.total}</div>
                    <div className="text-gray-500">Questions Answered</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{status.reviewed}/{status.needingReview}</div>
                    <div className="text-gray-500">Reviews Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{Math.round((status.answered / status.total) * 100)}%</div>
                    <div className="text-gray-500">Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">
                      {proposal.status === 'submitted' ? 'Submitted' : status.isComplete ? 'Ready' : 'In Progress'}
                    </div>
                    <div className="text-gray-500">Status</div>
                  </div>
                </div>

                {proposal.status !== 'submitted' && (
                  <div className="flex items-center space-x-4 pt-4 border-t">
                    <Select defaultValue="PDF">
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PDF">PDF</SelectItem>
                        <SelectItem value="DOCX">Word Doc</SelectItem>
                        <SelectItem value="ZIP">ZIP Archive</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Button variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Download Draft
                    </Button>
                    
                    <Button 
                      disabled={!status.isComplete}
                      onClick={() => submitProposalMutation.mutate({
                        proposalId: proposal.id,
                        submittedTo: proposal.client_name,
                        format: 'PDF'
                      })}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit Proposal
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {proposals?.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Send className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">No proposals ready</h3>
              <p className="text-gray-500">Complete drafts and reviews to prepare proposals for submission</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
