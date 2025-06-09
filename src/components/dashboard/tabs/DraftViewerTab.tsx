
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { FileText, Bot, User, AlertCircle, Edit3, Save, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DraftViewerTab() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingAnswers, setEditingAnswers] = useState<Record<string, string>>({});

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals-with-drafts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          sections!inner (
            *,
            questions!inner (
              *,
              answers (*),
              clarifications (*)
            )
          )
        `)
        .eq('created_by', user?.id)
        .in('status', ['draft', 'review'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const updateAnswerMutation = useMutation({
    mutationFn: async ({ answerId, questionId, newText, requiresReview }: {
      answerId: string;
      questionId: string;
      newText: string;
      requiresReview?: boolean;
    }) => {
      // Update the answer
      const { data: currentAnswer } = await supabase
        .from('answers')
        .select('version_number, generated_by')
        .eq('id', answerId)
        .single();

      const { error: answerError } = await supabase
        .from('answers')
        .update({
          answer_text: newText,
          version_number: (currentAnswer?.version_number || 1) + 1,
          generated_by: 'SME'
        })
        .eq('id', answerId);

      if (answerError) throw answerError;

      // Update question review flag if specified
      if (requiresReview !== undefined) {
        const { error: questionError } = await supabase
          .from('questions')
          .update({ requires_review: requiresReview })
          .eq('id', questionId);

        if (questionError) throw questionError;

        // If flagged for review, create review assignment
        if (requiresReview) {
          const { error: reviewError } = await supabase
            .from('review_assignments')
            .insert({
              question_id: questionId,
              assigned_to_user_id: null,
              status: 'pending'
            });

          if (reviewError && !reviewError.message.includes('duplicate')) {
            throw reviewError;
          }
        }
      }

      // Log the action
      await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'user_input',
          action: requiresReview ? 'flagged_for_review' : 'edited_answer',
          proposal_id: proposals?.find(p => 
            p.sections?.some(s => 
              s.questions?.some(q => q.id === questionId)
            )
          )?.id,
          question_id: questionId,
          metadata: {
            answer_id: answerId,
            question_id: questionId,
            new_version: (currentAnswer?.version_number || 1) + 1,
            previous_generated_by: currentAnswer?.generated_by,
            timestamp: new Date().toISOString()
          }
        });

      return { answerId, questionId, newText };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals-with-drafts'] });
      toast({
        title: "Answer updated",
        description: "The answer has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating answer",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSaveAnswer = (answerId: string, questionId: string, requiresReview?: boolean) => {
    const newText = editingAnswers[answerId];
    if (newText !== undefined) {
      updateAnswerMutation.mutate({ answerId, questionId, newText, requiresReview });
      setEditingAnswers(prev => {
        const updated = { ...prev };
        delete updated[answerId];
        return updated;
      });
    }
  };

  const getConfidenceBadge = (score: number | null) => {
    if (score === null) return null;
    
    let variant: "default" | "secondary" | "destructive" = "default";
    let label = "";
    
    if (score >= 0.8) {
      variant = "default";
      label = "High Confidence";
    } else if (score >= 0.6) {
      variant = "secondary";
      label = "Medium Confidence";
    } else {
      variant = "destructive";
      label = "Low Confidence";
    }

    return <Badge variant={variant}>{label}</Badge>;
  };

  if (isLoading) {
    return <div>Loading drafts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Draft Viewer</h2>
        <div className="flex space-x-2">
          <Button variant="outline">
            <Save className="mr-2 h-4 w-4" />
            Save All Drafts
          </Button>
          <Button>
            <FileText className="mr-2 h-4 w-4" />
            Ready for Review
          </Button>
        </div>
      </div>

      {proposals?.map((proposal) => {
        const totalQuestions = proposal.sections?.reduce((total, section) => 
          total + (section.questions?.length || 0), 0
        ) || 0;
        
        const answeredQuestions = proposal.sections?.reduce((total, section) => 
          total + (section.questions?.filter(q => q.answers && q.answers.length > 0).length || 0), 0
        ) || 0;

        return (
          <Card key={proposal.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{proposal.title}</CardTitle>
                  <CardDescription>
                    Client: {proposal.client_name} • Status: {proposal.status}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">
                    {answeredQuestions}/{totalQuestions} answered
                  </Badge>
                  {answeredQuestions === totalQuestions && totalQuestions > 0 && (
                    <Badge className="bg-green-50 text-green-700">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Complete
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {proposal.sections?.map((section) => (
                  <div key={section.id} className="border rounded-lg p-4">
                    <h3 className="font-medium text-lg mb-4">{section.title}</h3>
                    <div className="space-y-4">
                      {section.questions?.map((question) => {
                        const hasAnswer = question.answers && question.answers.length > 0;
                        const answer = question.answers?.[0];
                        const clarification = question.clarifications?.find(c => c.status === 'answered');
                        const isEditing = answer && editingAnswers[answer.id] !== undefined;

                        return (
                          <div key={question.id} className="border-l-4 border-gray-200 pl-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <p className="font-medium text-gray-900">{question.question_text}</p>
                              <div className="flex items-center space-x-2">
                                {clarification && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                    Clarification Used
                                  </Badge>
                                )}
                                {answer?.confidence_score && getConfidenceBadge(answer.confidence_score)}
                                {answer?.generated_by === 'SME' && (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-700">
                                    <Edit3 className="mr-1 h-3 w-3" />
                                    Edited
                                  </Badge>
                                )}
                                {answer && (
                                  <Badge variant="outline" className="text-xs">
                                    v{answer.version_number}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {clarification && (
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <p className="text-sm font-medium text-blue-900 mb-1">Clarification:</p>
                                <p className="text-blue-800">{clarification.answer_text}</p>
                              </div>
                            )}

                            {hasAnswer ? (
                              <div className="space-y-3">
                                <div className="bg-gray-50 p-3 rounded-lg">
                                  {isEditing ? (
                                    <Textarea
                                      value={editingAnswers[answer.id]}
                                      onChange={(e) => setEditingAnswers(prev => ({
                                        ...prev,
                                        [answer.id]: e.target.value
                                      }))}
                                      className="min-h-[100px]"
                                      placeholder="Edit answer..."
                                    />
                                  ) : (
                                    <p className="text-gray-700 whitespace-pre-wrap">
                                      {answer.answer_text}
                                    </p>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-4">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`review-${question.id}`}
                                        checked={question.requires_review}
                                        onCheckedChange={(checked) => {
                                          if (answer) {
                                            handleSaveAnswer(answer.id, question.id, checked as boolean);
                                          }
                                        }}
                                      />
                                      <label 
                                        htmlFor={`review-${question.id}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                      >
                                        Requires SME Review
                                      </label>
                                    </div>
                                  </div>
                                  
                                  <div className="flex space-x-2">
                                    {isEditing ? (
                                      <>
                                        <Button 
                                          size="sm" 
                                          onClick={() => handleSaveAnswer(answer.id, question.id)}
                                          disabled={updateAnswerMutation.isPending}
                                        >
                                          <Save className="mr-1 h-3 w-3" />
                                          Save
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          onClick={() => setEditingAnswers(prev => {
                                            const updated = { ...prev };
                                            delete updated[answer.id];
                                            return updated;
                                          })}
                                        >
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => setEditingAnswers(prev => ({
                                          ...prev,
                                          [answer.id]: answer.answer_text
                                        }))}
                                      >
                                        <Edit3 className="mr-1 h-3 w-3" />
                                        Edit
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-yellow-50 p-3 rounded-lg">
                                <div className="flex items-center">
                                  <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                                  <p className="text-yellow-800">
                                    Answers have not yet been generated by the ContentAgent.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {proposals?.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium">No draft proposals</h3>
            <p className="text-gray-500">Upload an RFP to start creating draft responses</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
