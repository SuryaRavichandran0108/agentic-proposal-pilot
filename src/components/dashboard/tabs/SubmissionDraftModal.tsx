
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SubmissionDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftMessage: string;
  clarificationsCount: number;
}

export function SubmissionDraftModal({ 
  isOpen, 
  onClose, 
  draftMessage, 
  clarificationsCount 
}: SubmissionDraftModalProps) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(draftMessage);
      toast.success('Draft message copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Clarifications Submitted Successfully
          </DialogTitle>
          <DialogDescription>
            {clarificationsCount} clarification{clarificationsCount !== 1 ? 's' : ''} prepared for client submission
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">Generated Draft Message:</h4>
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-white p-3 rounded border">
              {draftMessage}
            </pre>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Next Steps:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Copy the draft message above</li>
              <li>• Send via your preferred communication method (email, client portal, etc.)</li>
              <li>• The clarifications are now marked as "Submitted to Client"</li>
              <li>• You can track responses in the Clarifications tab</li>
            </ul>
          </div>
          
          <div className="flex justify-end">
            <Button onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
