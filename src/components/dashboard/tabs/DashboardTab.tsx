
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { FileText, MessageSquare, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { DemoNavigator } from '../DemoNavigator';

export function DashboardTab() {
  const { profile } = useAuthContext();

  // Fetch user's proposals
  const { data: proposals } = useQuery({
    queryKey: ['user-proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, title, client_name, status, created_at')
        .eq('created_by', profile?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id
  });

  // Fetch clarifications summary
  const { data: clarificationsSummary } = useQuery({
    queryKey: ['clarifications-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_clarifications_for_user');
      
      if (error) throw error;
      
      const summary = {
        total: data?.length || 0,
        suggested: data?.filter(c => c.status === 'suggested').length || 0,
        approved: data?.filter(c => c.status === 'approved').length || 0,
        submitted: data?.filter(c => c.status === 'submitted_to_client').length || 0,
        answered: data?.filter(c => c.response_text).length || 0,
      };
      
      return summary;
    },
    enabled: !!profile?.id
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome to your RFP Platform. Manage proposals, clarifications, and client responses.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Proposals</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proposals?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active RFP projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clarifications</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clarificationsSummary?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total clarification requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clarificationsSummary?.suggested || 0}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting your approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Client Responses</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clarificationsSummary?.answered || 0}</div>
            <p className="text-xs text-muted-foreground">
              Received from clients
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Proposals</CardTitle>
            <CardDescription>
              Your latest RFP projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {proposals && proposals.length > 0 ? (
                proposals.slice(0, 5).map((proposal) => (
                  <div key={proposal.id} className="flex items-center space-x-4">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {proposal.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {proposal.client_name}
                      </p>
                    </div>
                    <Badge variant="outline">{proposal.status}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-sm font-medium">No proposals yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload your first RFP to get started
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clarification Status</CardTitle>
            <CardDescription>
              Current clarification workflow status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <span className="text-sm">Pending Review</span>
                </div>
                <Badge variant="secondary">{clarificationsSummary?.suggested || 0}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-sm">Approved</span>
                </div>
                <Badge variant="outline">{clarificationsSummary?.approved || 0}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                  <span className="text-sm">Submitted to Client</span>
                </div>
                <Badge variant="outline">{clarificationsSummary?.submitted || 0}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-400 rounded-full"></div>
                  <span className="text-sm">Client Responded</span>
                </div>
                <Badge variant="outline">{clarificationsSummary?.answered || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Demo Navigation */}
      <DemoNavigator />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks to get you started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center space-x-4 p-4 border rounded-lg">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <h4 className="font-medium">Upload RFP</h4>
                <p className="text-sm text-muted-foreground">
                  Start by uploading your RFP document
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4 p-4 border rounded-lg">
              <MessageSquare className="h-8 w-8 text-green-500" />
              <div>
                <h4 className="font-medium">Review Clarifications</h4>
                <p className="text-sm text-muted-foreground">
                  Approve AI-generated clarification requests
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4 p-4 border rounded-lg">
              <Users className="h-8 w-8 text-purple-500" />
              <div>
                <h4 className="font-medium">Client Responses</h4>
                <p className="text-sm text-muted-foreground">
                  Manage incoming client clarifications
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
