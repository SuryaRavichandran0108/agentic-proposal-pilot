import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function UploadRFPTab() {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { profile } = useAuthContext();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf' || selectedFile.type.includes('document')) {
        setFile(selectedFile);
      } else {
        toast.error('Please select a PDF or Word document');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !file) return;

    setUploading(true);
    try {
      // Create proposal record
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          title,
          client_name: clientName,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          created_by: profile.id
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Create file record (simulating file upload)
      const { data: fileRecord, error: fileError } = await supabase
        .from('proposal_files')
        .insert({
          proposal_id: proposal.id,
          uploaded_by_user_id: profile.id,
          file_name: file.name,
          file_type: file.type,
          file_url: `mock://uploads/${file.name}`, // Mock URL
          status: 'uploaded'
        })
        .select()
        .single();

      if (fileError) throw fileError;

      // Log orchestrator action
      await supabase.from('agent_logs').insert({
        agent_name: 'Orchestrator',
        action: 'RFP uploaded, triggering ParserAgent',
        proposal_id: proposal.id,
        triggered_by_user_id: profile.id,
        metadata: { file_name: file.name, file_size: file.size }
      });

      // Trigger ParserAgent via Supabase functions.invoke
      try {
        const { data: parserResult, error: parserError } = await supabase.functions.invoke('parser-agent', {
          body: {
            proposal_id: proposal.id,
            file_id: fileRecord.id
          }
        });

        if (parserError) {
          throw new Error(`ParserAgent failed: ${parserError.message}`);
        }

        console.log('ParserAgent triggered successfully:', parserResult);
        toast.success('RFP uploaded successfully! ParserAgent is processing...');
      } catch (parserError: any) {
        console.error('Failed to trigger ParserAgent:', parserError);
        console.warn('ParserAgent trigger failed, but proposal was created successfully');
        toast.success('RFP uploaded successfully! Parser processing may be delayed.');
      }
      
      // Reset form
      setTitle('');
      setClientName('');
      setDueDate('');
      setFile(null);
      
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Upload RFP Document</CardTitle>
          <CardDescription>
            Upload a new RFP document to start the automated response process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Proposal Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Software Development RFP 2024"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Client Name</Label>
              <Input
                id="client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., Acme Corporation"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Due Date (Optional)</Label>
              <Input
                id="due-date"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">RFP Document</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <div className="text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label htmlFor="file" className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        {file ? file.name : 'Click to upload or drag and drop'}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500">
                        PDF or Word documents only
                      </span>
                    </label>
                    <input
                      id="file"
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileSelect}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={uploading || !file}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload RFP
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
