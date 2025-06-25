
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface ContentAgentRerunButtonProps {
  proposalId: string;
  disabled?: boolean;
}

export function ContentAgentRerunButton({ proposalId, disabled = false }: ContentAgentRerunButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if there's already a pending ContentAgent log
  const { data: pendingLogs, refetch: refetchPendingLogs } = useQuery({
    queryKey: ['pending-content-agent', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_logs')
        .select('id, created_at')
        .eq('proposal_id', proposalId)
        .eq('agent_name', 'ContentAgent')
        .eq('metadata->>status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking pending logs:', error);
        return [];
      }

      return data || [];
    }
  });

  const hasPendingLog = pendingLogs && pendingLogs.length > 0;

  const handleRerunContentAgent = async () => {
    if (isProcessing || disabled || hasPendingLog) {
      return;
    }

    try {
      setIsProcessing(true);
      console.log(`Triggering ContentAgent re-run for proposal: ${proposalId}`);
      
      toast.info('Reprocessing ContentAgent...', {
        description: 'Starting content generation process'
      });

      // Call the content-agent edge function
      const { data, error } = await supabase.functions.invoke('content-agent', {
        body: {
          proposal_id: proposalId,
          trigger_source: 'manual_rerun'
        }
      });

      if (error) {
        console.error('Content agent trigger failed:', error);
        toast.error('Failed to trigger ContentAgent', {
          description: error.message || 'Unknown error occurred'
        });
        return;
      }

      if (!data?.success) {
        console.error('Content agent returned failure:', data);
        toast.error('ContentAgent processing failed', {
          description: data?.error || 'Unknown error occurred'
        });
        return;
      }

      console.log('ContentAgent triggered successfully:', data);
      toast.success('ContentAgent reprocessing started', {
        description: `Processing answers for ${data.data?.answers_generated || 0} questions`
      });

      // Refresh the pending logs query to update button state
      await refetchPendingLogs();

    } catch (error) {
      console.error('Error triggering ContentAgent:', error);
      toast.error('Failed to trigger ContentAgent', {
        description: 'Network or system error occurred'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isButtonDisabled = disabled || isProcessing || hasPendingLog;

  return (
    <Button
      onClick={handleRerunContentAgent}
      disabled={isButtonDisabled}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isProcessing ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
          Processing...
        </>
      ) : hasPendingLog ? (
        <>
          <Clock className="h-4 w-4" />
          Already in Progress
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          Re-run ContentAgent
        </>
      )}
    </Button>
  );
}
