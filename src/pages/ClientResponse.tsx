import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, Lock, FileText, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface SubmissionDetails {
  submission_id: string;
  proposal_title: string;
  client_name: string;
  created_at: string;
  passcode: string | null;
  expires_at: string;
}

interface Clarification {
  clarification_id: string;
  prompt_text: string;
  edited_prompt_text: string | null;
  response_text: string | null;
  status: string;
  proposal_title: string;
  client_name: string;
  created_at: string;
}

export default function ClientResponse() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetails | null>(null);
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [passcodeInput, setPasscodeInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    if (submissionId) {
      fetchSubmissionDetails();
    }
  }, [submissionId]);

  const fetchSubmissionDetails = async () => {
    try {
      setLoading(true);
      
      // Get submission details
      const { data: details, error: detailsError } = await supabase
        .rpc('get_submission_details', { submission_uuid: submissionId });

      if (detailsError) throw detailsError;
      
      if (!details || details.length === 0) {
        setError('Clarification request not found or has expired.');
        return;
      }

      const submissionData = details[0];
      setSubmissionDetails(submissionData);

      // Check if passcode is required
      if (!submissionData.passcode) {
        setIsAuthenticated(true);
        await fetchClarifications();
      }
    } catch (err: any) {
      console.error('Error fetching submission details:', err);
      setError('Failed to load clarification request. Please check the link and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchClarifications = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_clarifications_by_submission', { submission_uuid: submissionId });

      if (error) throw error;

      setClarifications(data || []);
      
      // Initialize responses with existing data
      const initialResponses: Record<string, string> = {};
      data?.forEach((clarification: Clarification) => {
        initialResponses[clarification.clarification_id] = clarification.response_text || '';
      });
      setResponses(initialResponses);

      // Check if all responses are already submitted
      const allSubmitted = data?.every((c: Clarification) => c.response_text && c.status === 'answered');
      if (allSubmitted && data?.length > 0) {
        setIsSubmitted(true);
      }
    } catch (err: any) {
      console.error('Error fetching clarifications:', err);
      setError('Failed to load clarification questions.');
    }
  };

  const handlePasscodeSubmit = async () => {
    if (!submissionDetails || !passcodeInput) {
      toast.error('Please enter the passcode');
      return;
    }

    if (passcodeInput.toUpperCase() === submissionDetails.passcode?.toUpperCase()) {
      setIsAuthenticated(true);
      await fetchClarifications();
    } else {
      toast.error('Invalid passcode. Please check and try again.');
    }
  };

  const handleResponseChange = (clarificationId: string, value: string) => {
    setResponses(prev => ({
      ...prev,
      [clarificationId]: value
    }));
  };

  const handleSubmitResponses = async () => {
    if (!submissionId) return;

    // Validate responses
    const emptyResponses = clarifications.filter(c => 
      !responses[c.clarification_id]?.trim()
    );

    if (emptyResponses.length > 0) {
      toast.error(`Please provide responses to all ${clarifications.length} clarification${clarifications.length !== 1 ? 's' : ''}`);
      return;
    }

    try {
      setIsSubmitting(true);

      // Submit responses through the edge function
      const { data, error } = await supabase.functions.invoke('client-response-handler', {
        body: {
          submission_id: submissionId,
          responses: responses,
          contact_email: contactEmail || null
        }
      });

      if (error) {
        console.error('Submission error:', error);
        throw new Error(error.message || 'Failed to submit responses');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit responses');
      }

      console.log('Submission successful:', data);
      setIsSubmitted(true);
      toast.success('Your responses have been submitted successfully!');

    } catch (err: any) {
      console.error('Error submitting responses:', err);
      toast.error(err.message || 'Failed to submit responses. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!submissionId) {
    return <Navigate to="/404" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading clarification request...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-12">
            <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-4 text-lg font-medium text-red-600">Request Not Found</h3>
            <p className="text-gray-500 mt-2">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!submissionDetails) {
    return <Navigate to="/404" replace />;
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardContent className="text-center py-12">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-2xl font-bold text-green-600">Responses Submitted Successfully</h2>
            <p className="text-gray-600 mt-2">
              Thank you for your prompt response to our clarification request for <strong>{submissionDetails.proposal_title}</strong>.
            </p>
            <p className="text-gray-500 mt-4">
              Your responses have been received and will be reviewed by our proposal team. We appreciate your collaboration in ensuring a complete and accurate proposal response.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated && submissionDetails.passcode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Lock className="mx-auto h-12 w-12 text-blue-600" />
            <CardTitle>Secure Access Required</CardTitle>
            <CardDescription>
              This clarification request is protected. Please enter the passcode provided in your email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                type="text"
                placeholder="Enter passcode"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePasscodeSubmit()}
              />
            </div>
            <Button onClick={handlePasscodeSubmit} className="w-full">
              Access Clarification Form
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = new Date() > new Date(submissionDetails.expires_at);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <CardTitle className="text-2xl">RFP Clarification Request</CardTitle>
                <CardDescription className="text-lg">
                  {submissionDetails.proposal_title} • {submissionDetails.client_name}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-4">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Submitted: {format(new Date(submissionDetails.created_at), 'MMMM d, yyyy')}
              </div>
              <div className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {clarifications.length} Question{clarifications.length !== 1 ? 's' : ''}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {isExpired && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700">
                  This clarification request expired on {format(new Date(submissionDetails.expires_at), 'MMMM d, yyyy')}. 
                  Please contact the proposal team if you need to submit responses.
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Instructions:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Please provide detailed responses to each clarification question below</li>
                <li>• Your responses will help us prepare a complete and accurate proposal</li>
                <li>• All fields are required before submission</li>
                <li>• You can use bullet points, paragraphs, or any formatting that helps clarify your response</li>
              </ul>
            </div>

            {/* Contact Email */}
            <div>
              <Label htmlFor="contact-email">Your Email (Optional)</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="your.email@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1"
              />
              <p className="text-sm text-gray-500 mt-1">
                Providing your email helps us follow up if needed
              </p>
            </div>

            {/* Clarification Questions */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Clarification Questions:</h3>
              
              {clarifications.map((clarification, index) => (
                <Card key={clarification.clarification_id} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-medium text-gray-900">
                          Question {index + 1}:
                        </Label>
                        <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                          {clarification.edited_prompt_text || clarification.prompt_text}
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor={`response-${clarification.clarification_id}`}>
                          Your Response *
                        </Label>
                        <Textarea
                          id={`response-${clarification.clarification_id}`}
                          placeholder="Please provide your detailed response here..."
                          value={responses[clarification.clarification_id] || ''}
                          onChange={(e) => handleResponseChange(clarification.clarification_id, e.target.value)}
                          rows={4}
                          className="mt-1"
                          disabled={isExpired}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Submit Button */}
            {!isExpired && (
              <div className="flex justify-end pt-6 border-t">
                <Button
                  onClick={handleSubmitResponses}
                  disabled={isSubmitting}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Submitting Responses...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Submit All Responses ({clarifications.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
