
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, TestTube, Users } from 'lucide-react';

export function DemoNavigator() {
  const [submissionId, setSubmissionId] = useState('');
  const navigate = useNavigate();

  const handleTestClientForm = () => {
    if (submissionId.trim()) {
      window.open(`/client-response/${submissionId}`, '_blank');
    }
  };

  const generateTestId = () => {
    // Generate a simple test UUID for demo purposes
    const testId = 'test-' + Math.random().toString(36).substr(2, 9);
    setSubmissionId(testId);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Demo & Testing Tools
        </CardTitle>
        <CardDescription>
          Test the new client-facing clarification intake system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label htmlFor="submission-id">Test Client Response Form</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="submission-id"
                  placeholder="Enter submission ID"
                  value={submissionId}
                  onChange={(e) => setSubmissionId(e.target.value)}
                />
                <Button variant="outline" onClick={generateTestId}>
                  Generate Test ID
                </Button>
              </div>
            </div>
            <Button 
              onClick={handleTestClientForm}
              disabled={!submissionId.trim()}
              className="w-full"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Client Form in New Tab
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Platform Features</Label>
            <div className="space-y-2">
              <Badge variant="outline" className="w-full justify-center py-2">
                Professional Email Drafts
              </Badge>
              <Badge variant="outline" className="w-full justify-center py-2">
                Secure Client Intake Forms
              </Badge>
              <Badge variant="outline" className="w-full justify-center py-2">
                Passcode Protection
              </Badge>
              <Badge variant="outline" className="w-full justify-center py-2">
                Response Status Tracking
              </Badge>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">Testing Notes</h4>
              <p className="text-sm text-blue-700 mt-1">
                The client response form is designed to work without authentication. 
                Use the tabs above to manage clarifications as a proposal manager, 
                then test the client experience using the generated link.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
