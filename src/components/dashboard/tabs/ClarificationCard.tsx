
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Edit, Undo2, Calendar, User, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface ClarificationCardProps {
  clarification: {
    clarification_id: string;
    prompt_text: string;
    status: string;
    suggested_by: string;
    created_at: string;
    edited_prompt_text?: string;
    question_text: string;
    section_title: string;
    response_text?: string;
    answered_at?: string;
    answered_by_email?: string;
  };
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onMoveBackToReview?: (id: string) => void;
  onViewSubmission: () => void;
  isUpdating: boolean;
  getStatusBadge?: (status: string, hasResponse?: boolean) => JSX.Element;
}

export function ClarificationCard({ 
  clarification, 
  onApprove, 
  onDeny, 
  onEdit, 
  onMoveBackToReview,
  onViewSubmission,
  isUpdating,
  getStatusBadge
}: ClarificationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(
    clarification.edited_prompt_text || clarification.prompt_text
  );

  const handleSaveEdit = () => {
    onEdit(clarification.clarification_id, editText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(clarification.edited_prompt_text || clarification.prompt_text);
    setIsEditing(false);
  };

  // Use provided status badge function or default
  const statusBadge = getStatusBadge ? 
    getStatusBadge(clarification.status, !!clarification.response_text) :
    <Badge variant="secondary">{clarification.status}</Badge>;

  const canEdit = clarification.status === 'suggested' || clarification.status === 'approved';
  const canApprove = clarification.status === 'suggested';
  const canDeny = clarification.status === 'suggested';
  const canMoveBack = clarification.status === 'submitted_to_client' && onMoveBackToReview;

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {statusBadge}
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="h-4 w-4 mr-1" />
                {format(new Date(clarification.created_at), 'MMM d, yyyy')}
              </div>
            </div>
            <h4 className="font-medium text-gray-900 mb-1">
              {clarification.section_title}
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              Question: {clarification.question_text}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Clarification Request:
            </label>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveEdit}
                    size="sm"
                    disabled={isUpdating}
                  >
                    Save
                  </Button>
                  <Button
                    onClick={handleCancelEdit}
                    variant="outline"
                    size="sm"
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-3 rounded border">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {clarification.edited_prompt_text || clarification.prompt_text}
                </p>
                {clarification.edited_prompt_text && (
                  <p className="text-xs text-gray-500 mt-1 italic">
                    (Edited from original)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Client Response Section */}
          {clarification.response_text && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                Client Response:
              </label>
              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {clarification.response_text}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-blue-600">
                  {clarification.answered_at && (
                    <span>
                      Received: {format(new Date(clarification.answered_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                  {clarification.answered_by_email && (
                    <span>
                      From: {clarification.answered_by_email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              {canApprove && (
                <Button
                  onClick={() => onApprove(clarification.clarification_id)}
                  size="sm"
                  disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="mr-1 h-4 w-4" />
                  Approve
                </Button>
              )}
              {canDeny && (
                <Button
                  onClick={() => onDeny(clarification.clarification_id)}
                  size="sm"
                  variant="destructive"
                  disabled={isUpdating}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Deny
                </Button>
              )}
              {canMoveBack && (
                <Button
                  onClick={() => onMoveBackToReview!(clarification.clarification_id)}
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  className="border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  Move Back to Review
                </Button>
              )}
            </div>
            {canEdit && !isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                variant="outline"
                disabled={isUpdating}
              >
                <Edit className="mr-1 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
