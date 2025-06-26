import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Mail, Key, ArrowLeft } from "lucide-react";

interface AuthFormProps {
  onAuthSuccess: (user: { id: number; username: string }) => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password' | 'magic-link'>('login');
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    if (mode === 'forgot-password' || mode === 'magic-link') {
      if (!email.trim()) {
        setError("Email is required");
        return false;
      }
      if (!validateEmail(email)) {
        setError("Please enter a valid email address");
        return false;
      }
      return true;
    }

    if (!username.trim()) {
      setError("Username is required");
      return false;
    }
    
    if (username.length < 3) {
      setError("Username must be at least 3 characters long");
      return false;
    }
    
    if (!password) {
      setError("Password is required");
      return false;
    }
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }
    
    if (mode === 'register') {
      if (!email.trim()) {
        setError("Email is required for registration");
        return false;
      }
      if (!validateEmail(email)) {
        setError("Please enter a valid email address");
        return false;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      let endpoint = "";
      let body = {};

      switch (mode) {
        case 'login':
          endpoint = "/api/auth/login";
          body = { username, password };
          break;
        case 'register':
          endpoint = "/api/auth/register-with-email";
          body = { username, password, email };
          break;
        case 'forgot-password':
          endpoint = "/api/auth/forgot-password";
          body = { email };
          break;
        case 'magic-link':
          endpoint = "/api/auth/magic-link";
          body = { email };
          break;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      
      if (mode === 'login' || mode === 'register') {
        if (data.success && data.data) {
          onAuthSuccess(data.data);
        } else {
          throw new Error("Invalid response from server");
        }
      } else {
        // For forgot-password and magic-link, show success message
        setSuccess(data.data?.message || "Email sent successfully");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setEmail("");
  };

  const switchMode = (newMode: typeof mode) => {
    setMode(newMode);
    resetForm();
  };

  const getButtonText = () => {
    switch (mode) {
      case 'login': return "Sign In";
      case 'register': return "Create Account";
      case 'forgot-password': return "Send Reset Link";
      case 'magic-link': return "Send Magic Link";
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return "Welcome Back";
      case 'register': return "Create Account";
      case 'forgot-password': return "Reset Password";
      case 'magic-link': return "Magic Link Sign In";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login': return "Sign in to access your personal workout tracking";
      case 'register': return "Join EyeSpy AI to start tracking your fitness progress";
      case 'forgot-password': return "Enter your email to receive a password reset link";
      case 'magic-link': return "Enter your email to receive a magic sign-in link";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-2">
            EyeSpy AI
          </h1>
          <p className="text-slate-300">AI-Powered Exercise Form Analysis</p>
        </div>

        {/* Auth Form */}
        <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            {(mode === 'forgot-password' || mode === 'magic-link') && (
              <Button
                variant="ghost"
                onClick={() => switchMode('login')}
                className="absolute top-4 left-4 text-slate-400 hover:text-white p-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <CardTitle className="text-2xl font-semibold text-white">
              {getTitle()}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {getDescription()}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert className="bg-red-900/50 border-red-700/50 text-red-200">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-900/50 border-green-700/50 text-green-200">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              {/* Email field for registration, forgot password, and magic link */}
              {(mode === 'register' || mode === 'forgot-password' || mode === 'magic-link') && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Enter your email address"
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              )}
              
              {/* Username field for login and registration */}
              {(mode === 'login' || mode === 'register') && (
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-300">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Enter your username"
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              )}
              
              {/* Password field for login and registration */}
              {(mode === 'login' || mode === 'register') && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Enter your password"
                    disabled={loading}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
              )}
              
              {/* Confirm password field for registration */}
              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-slate-300">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Confirm your password"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {/* Forgot password link for login mode */}
              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot-password')}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    disabled={loading}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium transition-all duration-200"
                disabled={loading}
              >
                {loading ? "Processing..." : (() => {
                  switch (mode) {
                    case 'login': return "Sign In";
                    case 'register': return "Create Account";
                    case 'forgot-password': return "Send Reset Link";
                    case 'magic-link': return "Send Magic Link";
                  }
                })()}
              </Button>

              {/* Magic link option for login */}
              {mode === 'login' && (
                <>
                  <div className="relative">
                    <Separator className="bg-slate-600" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-slate-800 px-3 text-sm text-slate-400">or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => switchMode('magic-link')}
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                    disabled={loading}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Sign in with Magic Link
                  </Button>
                </>
              )}
            </form>
            
            {/* Mode switching */}
            {(mode === 'login' || mode === 'register') && (
              <div className="mt-6 text-center">
                <p className="text-slate-400">
                  {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                    className="ml-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    disabled={loading}
                  >
                    {mode === 'login' ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-sm">
          <p>Secure workout tracking with advanced pose detection</p>
        </div>
      </div>
    </div>
  );
}