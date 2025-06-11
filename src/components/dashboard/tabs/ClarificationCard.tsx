
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Check, X, Edit, Save, RotateCcw } from 'lucide-react';

interface ClarificationCardProps {
  clarification: {
    clarification_id: string;
    prompt_text: string;
    edited_prompt_text?: string;
    status: string;
    section_title: string;
    question_text: string;
  };
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEdit: (id: string, editedText: string) => void;
  isUpdating: boolean;
}

export function ClarificationCard({ 
  clarification, 
  onApprove, 
  onDeny, 
  onEdit, 
  isUpdating 
}: ClarificationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(
    clarification.edited_prompt_text || clarification.prompt_text
  );

  const handleSaveEdit = () => {
    onEdit(clarification.clarification_id, editedText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(clarification.edited_prompt_text || clarification.prompt_text);
    setIsEditing(false);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      suggested: { variant: 'outline' as const, label: 'Awaiting Review', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
      approved: { variant: 'outline' as const, label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' },
      denied: { variant: 'outline' as const, label: 'Denied', className: 'bg-red-50 text-red-700 border-red-200' },
      submitted_to_client: { variant: 'outline' as const, label: 'Submitted', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.suggested;
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const canReview = clarification.status === 'suggested';

  return (
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
          {getStatusBadge(clarification.status)}
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
          <h4 className="font-medium text-gray-900 mb-2">Clarification Request:</h4>
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="w-full"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveEdit}
                  disabled={isUpdating || !editedText.trim()}
                  size="sm"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  size="sm"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-700 bg-blue-50 p-3 rounded-lg">
                {clarification.edited_prompt_text || clarification.prompt_text}
              </p>
              {canReview && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => onApprove(clarification.clarification_id)}
                    disabled={isUpdating}
                    variant="outline"
                    size="sm"
                    className="border-green-200 text-green-700 hover:bg-green-50"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => onDeny(clarification.clarification_id)}
                    disabled={isUpdating}
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Deny
                  </Button>
                  <Button
                    onClick={() => setIsEditing(true)}
                    disabled={isUpdating}
                    variant="outline"
                    size="sm"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
