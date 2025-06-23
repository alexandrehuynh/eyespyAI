import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthGuard";
import UserProfile from "@/components/auth/UserProfile";

export default function AppHeader() {
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <>
      <header className="relative z-10 pt-8 pb-6">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            
            {/* Center - Logo and Title */}
            <div className="text-center">
              <div className="flex items-center justify-center space-x-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center text-2xl">
                  👁️
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                  EyeSpy AI
                </h1>
              </div>
              <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                AI-Powered Movement Tracking for Safe and Effective Workouts
              </p>
            </div>

            {/* Right - User Profile */}
            <div className="flex-1 flex justify-end">
              {user && (
                <Button
                  onClick={() => setShowProfile(true)}
                  variant="outline"
                  className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:border-slate-500 transition-all duration-200"
                >
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-sm font-bold mr-2">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  {user.username}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* User Profile Modal */}
      {showProfile && (
        <UserProfile onClose={() => setShowProfile(false)} />
      )}
    </>
  );
}
