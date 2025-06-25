import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { Download, Send, CheckCircle, AlertTriangle, FileText, Clock } from 'lucide-react';

interface Answer {
  id: string;
  answer_text: string;
  generated_by: string;
  version_number: number;
  created_at: string;
  question_id: string;
}

interface Clarification {
  id: string;
  answer_text: string | null;
  status: string;
}

interface Question {
  id: string;
  question_text: string;
  requires_review: boolean;
  reviewed: boolean;
  confidence_score: number | null;
  answers: Answer[];
  clarifications: Clarification[];
}

interface Section {
  id: string;
  title: string;
  order_index: number;
  questions: Question[];
}

interface ProposalPreview {
  id: string;
  title: string;
  client_name: string;
  status: string;
  due_date: string | null;
  created_at: string;
  sections: Section[];
}

export function ProposalBuilderTab() {
  const { profile } = useAuthContext();
  const queryClient = useQueryClient();
  const [selectedFormat, setSelectedFormat] = useState<'PDF' | 'DOCX' | 'ZIP'>('PDF');
  const [submissionEmail, setSubmissionEmail] = useState('');
  const [showSubmissionDialog, setShowSubmissionDialog] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalPreview | null>(null);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals-for-submission'],
    queryFn: async () => {
  const { data, error } = await supabase
    .from('proposals')
    .select(`
      id,
      title,
      client_name,
      status,
      due_date,
      created_at,
      sections (
        id,
        title,
        order_index,
        questions (
          id,
          question_text,
          requires_review,
          reviewed,
          confidence_score,
          answers (*),
          clarifications (*)
        )
      )
    `)
    .in('status', ['review', 'submitted'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  const normalized = data?.map((p) => ({
    ...p,
    sections: Array.isArray(p.sections)
      ? p.sections.map((s) => ({
          ...s,
          questions: Array.isArray(s.questions)
            ? s.questions.map((q) => ({
                ...q,
                answers: Array.isArray(q.answers) ? q.answers : q.answers ? [q.answers] : [],
                clarifications: Array.isArray(q.clarifications) ? q.clarifications : q.clarifications ? [q.clarifications] : [],
              }))
            : [],
        }))
      : [],
  }));

  return normalized as ProposalPreview[];
};


  });

  const submitProposalMutation = useMutation({
    mutationFn: async ({ proposalId, submittedTo, format }: { proposalId: string; submittedTo: string; format: 'PDF' | 'DOCX' | 'ZIP' }) => {
      const { data, error } = await supabase.functions.invoke('submission-agent', {
        body: {
          proposal_id: proposalId,
          submitted_by_user_id: profile?.id,
          submitted_to: submittedTo,
          format
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Proposal submitted successfully!');
      queryClient.invalidateQueries({ queryKey: ['proposals-for-submission'] });
      setShowSubmissionDialog(false);
      setSelectedProposal(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to submit proposal');
    }
  });

  const downloadDraftMutation = useMutation({
    mutationFn: async ({ proposalId, format }: { proposalId: string; format: string }) => {
      const proposal = proposals?.find(p => p.id === proposalId);
      if (!proposal) throw new Error('Proposal not found');

      const documentContent = {
        title: proposal.title,
        client: proposal.client_name,
        sections: proposal.sections.map(section => ({
          title: section.title,
          questions: section.questions.map(q => ({
            question: q.question_text,
            answer: Array.isArray(q.answers) && q.answers.length > 0 ? q.answers[0].answer_text : 'No answer provided',
            clarification: Array.isArray(q.clarifications) && q.clarifications.length > 0 ? q.clarifications[0].answer_text : null
          }))
        }))
      };

      const blob = new Blob([JSON.stringify(documentContent, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proposal.title.replace(/\s+/g, '_')}_draft.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('Draft downloaded successfully!');
    },
    onError: (error: any) => {
      toast.error('Failed to download draft');
    }
  });

  const getProposalCompletionStatus = (proposal: ProposalPreview) => {
    const allQuestions = proposal.sections?.flatMap(s => s.questions) || [];
    const questionsWithAnswers = allQuestions.filter(q => Array.isArray(q.answers) && q.answers.length > 0);
    const questionsNeedingReview = allQuestions.filter(q => q.requires_review);
    const reviewedQuestions = questionsNeedingReview.filter(q => q.reviewed);

    return {
      total: allQuestions.length,
      answered: questionsWithAnswers.length,
      needingReview: questionsNeedingReview.length,
      reviewed: reviewedQuestions.length,
      isComplete: questionsWithAnswers.length === allQuestions.length &&
        reviewedQuestions.length === questionsNeedingReview.length
    };
  };

  const handleSubmitProposal = (proposal: ProposalPreview) => {
    setSelectedProposal(proposal);
    setSubmissionEmail(`${proposal.client_name.toLowerCase().replace(/\s+/g, '.')}@example.com`);
    setShowSubmissionDialog(true);
  };

  const confirmSubmission = () => {
    if (!selectedProposal || !submissionEmail.trim()) return;

    submitProposalMutation.mutate({
      proposalId: selectedProposal.id,
      submittedTo: submissionEmail.trim(),
      format: selectedFormat
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proposal Builder</h2>
          <p className="text-gray-600">Preview, finalize, and submit completed proposals</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Template
        </Button>
      </div>

      <div className="grid gap-6">
        {proposals?.map((proposal) => {
          const status = getProposalCompletionStatus(proposal);
          const isSubmitted = proposal.status === 'submitted';

          return (
            <Card key={proposal.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {proposal.title}
                      {isSubmitted && <Badge variant="default">Submitted</Badge>}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4">
                      <span>Client: {proposal.client_name}</span>
                      {proposal.due_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due: {new Date(proposal.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    {status.isComplete && !isSubmitted && (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Ready for Submission
                      </Badge>
                    )}
                    {!status.isComplete && !isSubmitted && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Pending Reviews
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{status.answered}/{status.total}</div>
                    <div className="text-sm text-gray-600">Questions Answered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{status.reviewed}/{status.needingReview}</div>
                    <div className="text-sm text-gray-600">Reviews Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{Math.round((status.answered / status.total) * 100)}%</div>
                    <div className="text-sm text-gray-600">Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-700">
                      {isSubmitted ? 'Submitted' : status.isComplete ? 'Ready' : 'In Progress'}
                    </div>
                    <div className="text-sm text-gray-600">Status</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Proposal Preview
                  </h3>

                  {proposal.sections?.sort((a, b) => a.order_index - b.order_index).map((section) => (
                    <div key={section.id} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">{section.title}</h4>
                      <div className="space-y-3">
                        {section.questions.map((question) => (
                          <div key={question.id} className="bg-gray-50 p-3 rounded">
                            <div className="font-medium text-sm text-gray-700 mb-2">
                              {question.question_text}
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              {Array.isArray(question.answers) && question.answers.length > 0
                                ? question.answers[0].answer_text
                                : 'No answer provided'}
                            </div>
                            <div className="flex items-center gap-2">
                              {question.confidence_score && (
                                <Badge variant="outline" className="text-xs">
                                  Confidence: {Math.round(question.confidence_score * 100)}%
                                </Badge>
                              )}
                              {Array.isArray(question.answers) && question.answers.length > 0 && question.answers[0].generated_by === 'SME' && (
                                <Badge variant="outline" className="text-xs bg-blue-50">
                                  SME Edited
                                </Badge>
                              )}
                              {question.reviewed && (
                                <Badge variant="outline" className="text-xs bg-green-50">
                                  Reviewed
                                </Badge>
                              )}
                            </div>
                            {Array.isArray(question.clarifications) && question.clarifications.length > 0 && question.clarifications[0].answer_text && (
                              <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                                <strong>Clarification:</strong> {question.clarifications[0].answer_text}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {!isSubmitted && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center space-x-4">
                      <Select value={selectedFormat} onValueChange={(value) => setSelectedFormat(value as 'PDF' | 'DOCX' | 'ZIP')}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PDF">PDF</SelectItem>
                          <SelectItem value="DOCX">Word Doc</SelectItem>
                          <SelectItem value="ZIP">ZIP Archive</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="outline"
                        onClick={() => downloadDraftMutation.mutate({ proposalId: proposal.id, format: selectedFormat })}
                        disabled={downloadDraftMutation.isPending}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Draft
                      </Button>
                    </div>

                    <Button
                      disabled={!status.isComplete}
                      onClick={() => handleSubmitProposal(proposal)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit Proposal
                    </Button>
                  </div>
                )}

                {isSubmitted && (
                  <div className="flex items-center justify-center py-4 border-t bg-green-50 rounded">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">
                        Submitted on {new Date(proposal.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {proposals?.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">No proposals ready</h3>
              <p className="text-gray-500">Complete drafts and reviews to prepare proposals for submission</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showSubmissionDialog} onOpenChange={setShowSubmissionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Proposal</DialogTitle>
            <DialogDescription>
              Are you ready to submit "{selectedProposal?.title}" to the client?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="submission-email">Client Email</Label>
              <Input
                id="submission-email"
                type="email"
                value={submissionEmail}
                onChange={(e) => setSubmissionEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>

            <div>
              <Label htmlFor="submission-format">Format</Label>
              <Select value={selectedFormat} onValueChange={(value) => setSelectedFormat(value as 'PDF' | 'DOCX' | 'ZIP')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">PDF Document</SelectItem>
                  <SelectItem value="DOCX">Word Document</SelectItem>
                  <SelectItem value="ZIP">ZIP Archive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowSubmissionDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmSubmission}
              disabled={submitProposalMutation.isPending || !submissionEmail.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitProposalMutation.isPending ? 'Submitting...' : 'Submit Proposal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
