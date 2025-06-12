
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

interface SubmissionDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  draftMessage: string;
  clarificationsCount: number;
  isConfirming: boolean;
}

export function SubmissionDraftModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  draftMessage, 
  clarificationsCount,
  isConfirming
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
            <Send className="h-5 w-5 text-blue-600" />
            Review Clarifications for Submission
          </DialogTitle>
          <DialogDescription>
            Review the draft message for {clarificationsCount} clarification{clarificationsCount !== 1 ? 's' : ''} before confirming submission
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
          
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h4 className="font-medium text-amber-900 mb-2">⚠️ Important Note:</h4>
            <p className="text-sm text-amber-800">
              Clicking "Confirm Submission" will mark these clarifications as "Submitted to Client" and they will be moved out of your approved list. 
              You can use "Move Back to Review" later if needed.
            </p>
          </div>
          
          <div className="flex justify-between">
            <Button 
              onClick={onClose} 
              variant="outline"
              disabled={isConfirming}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={copyToClipboard}
                variant="secondary"
                disabled={isConfirming}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy & Close
              </Button>
              <Button 
                onClick={onConfirm}
                disabled={isConfirming}
                className="bg-green-600 hover:bg-green-700"
              >
                {isConfirming ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm Submission
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
