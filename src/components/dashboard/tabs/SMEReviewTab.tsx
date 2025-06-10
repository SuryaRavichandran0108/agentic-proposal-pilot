
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertCircle, Clock, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReviewAssignment {
  id: string;
  question_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  comment: string | null;
  created_at: string;
  questions: {
    id: string;
    question_text: string;
    confidence_score: number | null;
    reviewed: boolean;
    sections: {
      title: string;
      proposals: {
        title: string;
        client_name: string;
      };
    };
  };
  answers: Array<{
    id: string;
    answer_text: string;
    version_number: number;
    generated_by: 'AI' | 'SME';
  }>;
  clarifications: Array<{
    answer_text: string | null;
    status: string;
  }>;
}

export function SMEReviewTab() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});

  // Fetch review assignments for current user
  const { data: assignments, isLoading, error } = useQuery({
    queryKey: ['review-assignments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('review_assignments')
        .select(`
          id,
          question_id,
          status,
          comment,
          created_at,
          questions!inner (
            id,
            question_text,
            confidence_score,
            reviewed,
            sections!inner (
              title,
              proposals!inner (
                title,
                client_name
              )
            )
          ),
          answers:questions (
            answers (
              id,
              answer_text,
              version_number,
              generated_by
            )
          ),
          clarifications:questions (
            clarifications (
              answer_text,
              status
            )
          )
        `)
        .eq('assigned_to_user_id', user.id)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Flatten the nested structure for easier access
      return data?.map((assignment: any) => ({
        ...assignment,
        answers: assignment.questions?.answers || [],
        clarifications: assignment.questions?.clarifications || []
      })) || [];
    },
    enabled: !!user?.id
  });

  // Complete review mutation
  const completeReviewMutation = useMutation({
    mutationFn: async ({ assignmentId, questionId, comment }: { 
      assignmentId: string; 
      questionId: string; 
      comment?: string;
    }) => {
      // Update review assignment status
      const { error: assignmentError } = await supabase
        .from('review_assignments')
        .update({ 
          status: 'completed',
          comment: comment || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId);

      if (assignmentError) throw assignmentError;

      // Update question reviewed status
      const { error: questionError } = await supabase
        .from('questions')
        .update({ reviewed: true })
        .eq('id', questionId);

      if (questionError) throw questionError;

      // Log the action
      await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'reviewer_input',
          action: 'review_completed',
          proposal_id: assignments?.find(a => a.id === assignmentId)?.questions.sections.proposals.id || '',
          question_id: questionId,
          triggered_by_user_id: user?.id,
          metadata: {
            assignment_id: assignmentId,
            reviewer_id: user?.id,
            reviewed_at: new Date().toISOString(),
            comment: comment || null
          }
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-assignments'] });
      toast({
        title: "Review Completed",
        description: "The question has been marked as reviewed.",
      });
    },
    onError: (error) => {
      console.error('Error completing review:', error);
      toast({
        title: "Error",
        description: "Failed to complete the review. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Request rework mutation
  const requestReworkMutation = useMutation({
    mutationFn: async ({ assignmentId, questionId, comment }: { 
      assignmentId: string; 
      questionId: string; 
      comment: string;
    }) => {
      const { error } = await supabase
        .from('review_assignments')
        .update({ 
          status: 'rework_requested',
          comment,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId);

      if (error) throw error;

      // Log the action
      await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'reviewer_input',
          action: 'rework_requested',
          proposal_id: assignments?.find(a => a.id === assignmentId)?.questions.sections.proposals.id || '',
          question_id: questionId,
          triggered_by_user_id: user?.id,
          metadata: {
            assignment_id: assignmentId,
            reviewer_id: user?.id,
            comment,
            timestamp: new Date().toISOString()
          }
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-assignments'] });
      toast({
        title: "Rework Requested",
        description: "The question has been flagged for rework.",
      });
    },
    onError: (error) => {
      console.error('Error requesting rework:', error);
      toast({
        title: "Error",
        description: "Failed to request rework. Please try again.",
        variant: "destructive",
      });
    }
  });

  const getConfidenceBadge = (score: number | null) => {
    if (!score) return <Badge variant="secondary">Unknown</Badge>;
    
    if (score >= 0.8) return <Badge variant="default" className="bg-green-100 text-green-800">High Confidence</Badge>;
    if (score >= 0.6) return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Medium Confidence</Badge>;
    return <Badge variant="default" className="bg-red-100 text-red-800">Low Confidence</Badge>;
  };

  const handleCompleteReview = (assignmentId: string, questionId: string) => {
    completeReviewMutation.mutate({
      assignmentId,
      questionId,
      comment: comments[assignmentId]
    });
  };

  const handleRequestRework = (assignmentId: string, questionId: string) => {
    const comment = comments[assignmentId];
    if (!comment?.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment explaining why rework is needed.",
        variant: "destructive",
      });
      return;
    }
    
    requestReworkMutation.mutate({
      assignmentId,
      questionId,
      comment: comment.trim()
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">Error loading review assignments</p>
      </div>
    );
  }

  if (!assignments || assignments.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Reviews</h3>
        <p className="text-gray-600">
          You have no questions assigned for review at this time.
        </p>
      </div>
    );
  }

  const pendingCount = assignments.filter(a => a.status === 'pending').length;
  const inProgressCount = assignments.filter(a => a.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      {/* Header with progress summary */}
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">SME Review Queue</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-gray-600">
              {pendingCount} Pending Reviews
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-gray-600">
              {inProgressCount} In Progress
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <FileText className="h-5 w-5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {assignments.length} Total Assigned
            </span>
          </div>
        </div>
      </div>

      {/* Review assignments */}
      <div className="space-y-4">
        {assignments.map((assignment) => {
          const latestAnswer = assignment.answers?.[0]?.answers?.[0];
          const clarification = assignment.clarifications?.[0]?.clarifications?.find(
            (c: any) => c.status === 'answered' && c.answer_text
          );

          return (
            <Card key={assignment.id} className="w-full">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">
                      {assignment.questions.sections.proposals.title}
                    </CardTitle>
                    <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                      <span>Client: {assignment.questions.sections.proposals.client_name}</span>
                      <span>•</span>
                      <span>Section: {assignment.questions.sections.title}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getConfidenceBadge(assignment.questions.confidence_score)}
                      {latestAnswer?.version_number > 1 && (
                        <Badge variant="outline">
                          Edited (v{latestAnswer.version_number})
                        </Badge>
                      )}
                      {latestAnswer?.generated_by === 'SME' && (
                        <Badge variant="outline">Human Edited</Badge>
                      )}
                    </div>
                  </div>
                  <Badge 
                    variant={assignment.status === 'pending' ? 'secondary' : 'default'}
                    className={assignment.status === 'pending' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}
                  >
                    {assignment.status === 'pending' ? 'Pending' : 'In Progress'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Question */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Question:</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-md">
                    {assignment.questions.question_text}
                  </p>
                </div>

                {/* Clarification if available */}
                {clarification?.answer_text && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Clarification Used:
                      <Badge variant="outline" className="ml-2">Context</Badge>
                    </h4>
                    <p className="text-gray-700 bg-blue-50 p-3 rounded-md border-l-4 border-blue-200">
                      {clarification.answer_text}
                    </p>
                  </div>
                )}

                {/* Answer */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    Current Answer:
                    {latestAnswer && (
                      <span className="ml-2 text-sm text-gray-500">
                        (Generated by {latestAnswer.generated_by})
                      </span>
                    )}
                  </h4>
                  {latestAnswer ? (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <p className="text-gray-700">{latestAnswer.answer_text}</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No answer available</p>
                  )}
                </div>

                <Separator />

                {/* Comment section */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Review Comments (Optional):</h4>
                  <Textarea
                    placeholder="Add any comments or feedback about this answer..."
                    value={comments[assignment.id] || ''}
                    onChange={(e) => setComments(prev => ({
                      ...prev,
                      [assignment.id]: e.target.value
                    }))}
                    className="min-h-[80px]"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => handleRequestRework(assignment.id, assignment.question_id)}
                    disabled={requestReworkMutation.isPending}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Needs Rework
                  </Button>
                  <Button
                    onClick={() => handleCompleteReview(assignment.id, assignment.question_id)}
                    disabled={completeReviewMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Reviewed
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
