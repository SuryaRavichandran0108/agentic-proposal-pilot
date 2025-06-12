
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Copy, CheckCircle, Send, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface SubmissionDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: { passcode?: string }) => void;
  draftMessage: string;
  clarificationsCount: number;
  isConfirming: boolean;
  proposalTitle: string;
  clientName: string;
  managerName?: string;
  companyName?: string;
}

export function SubmissionDraftModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  draftMessage, 
  clarificationsCount,
  isConfirming,
  proposalTitle,
  clientName,
  managerName = "Your Name",
  companyName = "Your Organization"
}: SubmissionDraftModalProps) {
  const [usePasscode, setUsePasscode] = useState(false);
  const [passcode, setPasscode] = useState('');

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(draftMessage);
      toast.success('Draft message copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleConfirm = () => {
    const options = usePasscode && passcode ? { passcode } : {};
    onConfirm(options);
  };

  const generatePasscode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setPasscode(code);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Professional Clarification Request
          </DialogTitle>
          <DialogDescription>
            Review the professional email draft for {clarificationsCount} clarification{clarificationsCount !== 1 ? 's' : ''} before submitting to {clientName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Passcode Protection Option */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-600" />
                <Label htmlFor="use-passcode" className="font-medium text-blue-900">
                  Secure with Passcode (Optional)
                </Label>
              </div>
              <Switch
                id="use-passcode"
                checked={usePasscode}
                onCheckedChange={setUsePasscode}
              />
            </div>
            {usePasscode && (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter passcode or generate one"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={generatePasscode} variant="outline" size="sm">
                  Generate
                </Button>
              </div>
            )}
            {usePasscode && (
              <p className="text-xs text-blue-700 mt-2">
                The passcode will be included in your email and required for clients to access the form.
              </p>
            )}
          </div>

          {/* Email Draft */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">Professional Email Draft:</h4>
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
            <h4 className="font-medium text-amber-900 mb-2">⚠️ Before You Continue:</h4>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• Clicking "Send Clarifications" will mark them as "Submitted to Client"</li>
              <li>• A secure response form will be generated for the client</li>
              <li>• You'll be notified when the client submits their responses</li>
              <li>• You can always use "Move Back to Review" if needed later</li>
            </ul>
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
                onClick={handleConfirm}
                disabled={isConfirming}
                className="bg-green-600 hover:bg-green-700"
              >
                {isConfirming ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Send Clarifications to Client
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
