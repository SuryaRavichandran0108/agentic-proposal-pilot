
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { User, CheckCircle, Clock } from 'lucide-react';

export function SMEReviewTab() {
  const [comments, setComments] = useState<Record<string, string>>({});
  const { profile } = useAuthContext();
  const queryClient = useQueryClient();

  const { data: reviewAssignments, isLoading } = useQuery({
    queryKey: ['review-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_assignments')
        .select(`
          *,
          questions (
            *,
            answers (*),
            sections (
              *,
              proposals (*)
            )
          )
        `)
        .eq('assigned_to_user_id', profile?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const submitReviewMutation = useMutation({
    mutationFn: async ({ assignmentId, comment, status }: { 
      assignmentId: string; 
      comment: string; 
      status: 'completed' 
    }) => {
      const { error } = await supabase
        .from('review_assignments')
        .update({
          comment,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId);

      if (error) throw error;

      // Update question as reviewed
      const assignment = reviewAssignments?.find(a => a.id === assignmentId);
      if (assignment) {
        await supabase
          .from('questions')
          .update({ reviewed: true })
          .eq('id', assignment.question_id);

        // Log the review action
        await supabase.from('agent_logs').insert({
          agent_name: 'SME',
          action: 'Completed question review',
          proposal_id: assignment.questions.sections.proposals.id,
          question_id: assignment.question_id,
          triggered_by_user_id: profile?.id,
          metadata: { comment }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-assignments'] });
      toast.success('Review submitted successfully!');
      setComments({});
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const handleSubmitReview = (assignmentId: string) => {
    const comment = comments[assignmentId];
    if (!comment?.trim()) {
      toast.error('Please provide a review comment');
      return;
    }
    submitReviewMutation.mutate({ assignmentId, comment, status: 'completed' });
  };

  if (isLoading) {
    return <div>Loading review assignments...</div>;
  }

  const pendingReviews = reviewAssignments?.filter(r => r.status === 'pending') || [];
  const completedReviews = reviewAssignments?.filter(r => r.status === 'completed') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">SME Review Queue</h2>
        <Badge variant="secondary">
          {pendingReviews.length} pending reviews
        </Badge>
      </div>

      <div className="grid gap-6">
        {pendingReviews.length === 0 && completedReviews.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <User className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">No reviews assigned</h3>
              <p className="text-gray-500">Questions requiring expert review will appear here</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {pendingReviews.map((assignment) => (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {assignment.questions.sections.proposals.title}
                      </CardTitle>
                      <CardDescription>
                        Section: {assignment.questions.sections.title}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                      <Clock className="mr-1 h-3 w-3" />
                      Review Needed
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Question:</h4>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                      {assignment.questions.question_text}
                    </p>
                  </div>
                  
                  {assignment.questions.answers && assignment.questions.answers.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">AI-Generated Draft:</h4>
                      <p className="text-gray-700 bg-blue-50 p-3 rounded-lg">
                        {assignment.questions.answers[0].answer_text}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="font-medium text-gray-900">Your Expert Review:</label>
                    <Textarea
                      value={comments[assignment.id] || ''}
                      onChange={(e) => setComments(prev => ({
                        ...prev,
                        [assignment.id]: e.target.value
                      }))}
                      placeholder="Provide your expert feedback, suggestions, or approve the current draft..."
                      rows={4}
                    />
                    <Button 
                      onClick={() => handleSubmitReview(assignment.id)}
                      disabled={!comments[assignment.id]?.trim() || submitReviewMutation.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Submit Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {completedReviews.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Completed Reviews</h3>
                {completedReviews.map((assignment) => (
                  <Card key={assignment.id} className="mb-4">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          {assignment.questions.sections.proposals.title}
                        </CardTitle>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Reviewed
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <span className="font-medium">Question: </span>
                          <span className="text-gray-700">{assignment.questions.question_text}</span>
                        </div>
                        <div>
                          <span className="font-medium">Your Review: </span>
                          <span className="text-gray-700">{assignment.comment}</span>
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
