
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

  // Build the list of available tabs based on user role
  const availableTabs = [
    { value: 'dashboard', label: 'Dashboard', show: true },
    { value: 'upload', label: 'Upload RFP', show: isProposalManager },
    { value: 'clarifications', label: 'Clarifications', show: isProposalManager },
    { value: 'draft', label: 'Draft Viewer', show: true },
    { value: 'review', label: 'SME Review', show: isReviewer },
    { value: 'builder', label: 'Proposal Builder', show: isProposalManager },
  ].filter(tab => tab.show);

  // If user tries to access a tab they don't have permission for, redirect to dashboard
  React.useEffect(() => {
    const hasAccessToCurrentTab = availableTabs.some(tab => tab.value === activeTab);
    if (!hasAccessToCurrentTab) {
      setActiveTab('dashboard');
    }
  }, [activeTab, availableTabs]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, 1fr)` }}>
            {availableTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardTab />
          </TabsContent>

          {isProposalManager && (
            <TabsContent value="upload" className="mt-6">
              <UploadRFPTab />
            </TabsContent>
          )}

          {isProposalManager && (
            <TabsContent value="clarifications" className="mt-6">
              <ClarificationsTab />
            </TabsContent>
          )}

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
