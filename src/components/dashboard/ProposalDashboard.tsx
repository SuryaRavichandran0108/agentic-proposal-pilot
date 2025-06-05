
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigation } from '@/components/layout/Navigation';
import { UploadRFPTab } from './tabs/UploadRFPTab';
import { ClarificationsTab } from './tabs/ClarificationsTab';
import { DraftViewerTab } from './tabs/DraftViewerTab';
import { SMEReviewTab } from './tabs/SMEReviewTab';
import { ProposalBuilderTab } from './tabs/ProposalBuilderTab';
import { DashboardTab } from './tabs/DashboardTab';
import { useAuthContext } from '@/components/auth/AuthProvider';

export function ProposalDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { isProposalManager, isReviewer } = useAuthContext();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            {isProposalManager && <TabsTrigger value="upload">Upload RFP</TabsTrigger>}
            <TabsTrigger value="clarifications">Clarifications</TabsTrigger>
            <TabsTrigger value="draft">Draft Viewer</TabsTrigger>
            {isReviewer && <TabsTrigger value="review">SME Review</TabsTrigger>}
            {isProposalManager && <TabsTrigger value="builder">Proposal Builder</TabsTrigger>}
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardTab />
          </TabsContent>

          {isProposalManager && (
            <TabsContent value="upload" className="mt-6">
              <UploadRFPTab />
            </TabsContent>
          )}

          <TabsContent value="clarifications" className="mt-6">
            <ClarificationsTab />
          </TabsContent>

          <TabsContent value="draft" className="mt-6">
            <DraftViewerTab />
          </TabsContent>

          {isReviewer && (
            <TabsContent value="review" className="mt-6">
              <SMEReviewTab />
            </TabsContent>
          )}

          {isProposalManager && (
            <TabsContent value="builder" className="mt-6">
              <ProposalBuilderTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
