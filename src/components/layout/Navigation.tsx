
import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { LogOut, User } from 'lucide-react';

export function Navigation() {
  const { profile, signOut } = useAuthContext();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">
              Agentic RFP Platform
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-700">
              <User className="h-4 w-4" />
              <span>{profile?.name}</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                {profile?.role?.replace('_', ' ')}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
