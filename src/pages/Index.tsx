
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { ProposalDashboard } from '@/components/dashboard/ProposalDashboard';

export default function Index() {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading application...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, show the main dashboard
  if (user) {
    return <ProposalDashboard />;
  }

  // If not authenticated, redirect to auth page or show login
  return <Navigate to="/auth" replace />;
}
