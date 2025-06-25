
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
  const [lastTriggerTime, setLastTriggerTime] = useState<number | null>(null);

  // Check if there's already a pending ContentAgent log
  const { data: pendingLogs, refetch: refetchPendingLogs } = useQuery({
    queryKey: ['pending-content-agent', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_logs')
        .select('id, created_at, metadata')
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
    },
    refetchInterval: 5000 // Check every 5 seconds for status updates
  });

  const hasPendingLog = pendingLogs && pendingLogs.length > 0;

  // Cooldown check (1 minute)
  const isInCooldown = lastTriggerTime && (Date.now() - lastTriggerTime) < 60000;

  const handleRerunContentAgent = async () => {
    if (isProcessing || disabled || hasPendingLog || isInCooldown) {
      if (isInCooldown) {
        const remainingSeconds = Math.ceil((60000 - (Date.now() - lastTriggerTime!)) / 1000);
        toast.error(`Please wait ${remainingSeconds} seconds before triggering again`);
      }
      return;
    }

    try {
      setIsProcessing(true);
      console.log(`Triggering ContentAgent re-run for proposal: ${proposalId}`);
      
      toast.info('Starting ContentAgent...', {
        description: 'Processing clarifications and generating answers'
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
          description: error.message || 'Network or system error occurred'
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
      toast.success('ContentAgent started successfully', {
        description: `Processing answers for proposal`
      });

      // Set cooldown timer
      setLastTriggerTime(Date.now());

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

  const isButtonDisabled = disabled || isProcessing || hasPendingLog || isInCooldown;

  const getButtonText = () => {
    if (isProcessing) return 'Processing...';
    if (hasPendingLog) return 'Already in Progress';
    if (isInCooldown) {
      const remainingSeconds = Math.ceil((60000 - (Date.now() - lastTriggerTime!)) / 1000);
      return `Wait ${remainingSeconds}s`;
    }
    return 'Re-run ContentAgent';
  };

  const getButtonIcon = () => {
    if (isProcessing) {
      return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />;
    }
    if (hasPendingLog) {
      return <Clock className="h-4 w-4" />;
    }
    return <RefreshCw className="h-4 w-4" />;
  };

  return (
    <Button
      onClick={handleRerunContentAgent}
      disabled={isButtonDisabled}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {getButtonIcon()}
      {getButtonText()}
    </Button>
  );
}
