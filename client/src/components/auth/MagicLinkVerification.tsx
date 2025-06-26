import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";

interface MagicLinkVerificationProps {
  onAuthSuccess: (user: { id: number; username: string }) => void;
  onError: () => void;
}

export default function MagicLinkVerification({ onAuthSuccess, onError }: MagicLinkVerificationProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const verifyMagicLink = async () => {
      try {
        // Extract token from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (!token) {
          throw new Error("Invalid magic link. Token not found.");
        }

        const response = await fetch(`/api/auth/magic?token=${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "include",
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Magic link verification failed");
        }
        
        if (data.success && data.data) {
          setSuccess(true);
          
          // Wait a moment to show success state, then authenticate
          setTimeout(() => {
            onAuthSuccess({
              id: data.data.id,
              username: data.data.username
            });
          }, 2000);
        } else {
          throw new Error("Invalid response from server");
        }
        
      } catch (err) {
        console.error("Magic link verification error:", err);
        setError(err instanceof Error ? err.message : "Magic link verification failed");
      } finally {
        setLoading(false);
      }
    };

    verifyMagicLink();
  }, [onAuthSuccess]);

  const handleBackToLogin = () => {
    onError();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-black flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-2">
              EyeSpy AI
            </h1>
            <p className="text-slate-300">AI-Powered Exercise Form Analysis</p>
          </div>

          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-900/50 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
              <CardTitle className="text-2xl font-semibold text-white">
                Verifying Magic Link
              </CardTitle>
              <CardDescription className="text-slate-400">
                Please wait while we sign you in...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-black flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-2">
              EyeSpy AI
            </h1>
            <p className="text-slate-300">AI-Powered Exercise Form Analysis</p>
          </div>

          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <CardTitle className="text-2xl font-semibold text-white">
                Successfully Signed In
              </CardTitle>
              <CardDescription className="text-slate-400">
                Welcome back! Redirecting to your dashboard...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-2">
            EyeSpy AI
          </h1>
          <p className="text-slate-300">AI-Powered Exercise Form Analysis</p>
        </div>

        <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
            <CardTitle className="text-2xl font-semibold text-white">
              Magic Link Verification Failed
            </CardTitle>
            <CardDescription className="text-slate-400">
              We couldn't verify your magic link
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {error && (
              <Alert className="bg-red-900/50 border-red-700/50 text-red-200 mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="text-sm text-slate-400 space-y-2">
                <p>Common reasons for failure:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-500">
                  <li>The magic link has expired (links expire after 5 minutes)</li>
                  <li>The link has already been used</li>
                  <li>The link was malformed or incomplete</li>
                </ul>
              </div>

              <Button 
                onClick={handleBackToLogin}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium transition-all duration-200"
              >
                <Mail className="h-4 w-4 mr-2" />
                Back to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-slate-500 text-sm">
          <p>Need help? Try requesting a new magic link</p>
        </div>
      </div>
    </div>
  );
}