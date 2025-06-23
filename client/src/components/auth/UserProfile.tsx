import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "./AuthGuard";

interface UserProfileProps {
  onClose: () => void;
}

export default function UserProfile({ onClose }: UserProfileProps) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <Card className="bg-slate-800/90 border-slate-700/50 w-full max-w-md">
        <CardHeader className="text-center border-b border-slate-700/30">
          <CardTitle className="text-xl font-semibold text-white">User Profile</CardTitle>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-6">
          {/* User Info */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-white">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{user.username}</h3>
              <Badge className="bg-slate-700/80 text-slate-200 border-slate-600/50">
                User ID: {user.id}
              </Badge>
            </div>
          </div>

          {/* Account Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              {loggingOut ? "Signing Out..." : "Sign Out"}
            </Button>
            
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
            >
              Close
            </Button>
          </div>

          {/* Account Info */}
          <div className="text-center text-sm text-slate-400 pt-4 border-t border-slate-700/30">
            <p>Your workout data is private and secure</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}