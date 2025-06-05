
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Clock, FileText, Users } from 'lucide-react';

export function DashboardTab() {
  const { data: proposals } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: agentLogs } = useQuery({
    queryKey: ['agent-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    }
  });

  const stats = [
    {
      title: 'Active Proposals',
      value: proposals?.filter(p => p.status !== 'submitted').length || 0,
      icon: FileText,
      description: 'Proposals in progress'
    },
    {
      title: 'Pending Reviews',
      value: '0', // TODO: Calculate from review_assignments
      icon: Users,
      description: 'Awaiting SME input'
    },
    {
      title: 'Agent Activities',
      value: agentLogs?.length || 0,
      icon: Activity,
      description: 'Recent AI actions'
    },
    {
      title: 'Avg. Time Saved',
      value: '2.3h',
      icon: Clock,
      description: 'Per proposal vs baseline'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Proposals</CardTitle>
            <CardDescription>Your latest RFP submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {proposals?.slice(0, 5).map((proposal) => (
                <div key={proposal.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{proposal.title}</p>
                    <p className="text-sm text-gray-500">{proposal.client_name}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    proposal.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    proposal.status === 'review' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {proposal.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Activity</CardTitle>
            <CardDescription>Recent AI agent actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentLogs?.map((log) => (
                <div key={log.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Activity className="h-4 w-4 mt-1 text-blue-500" />
                  <div className="flex-1">
                    <p className="font-medium">{log.agent_name}</p>
                    <p className="text-sm text-gray-600">{log.action}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
