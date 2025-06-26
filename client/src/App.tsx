import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard, { AuthProvider, useAuth } from "@/components/auth/AuthGuard";
import PasswordResetForm from "@/components/auth/PasswordResetForm";
import MagicLinkVerification from "@/components/auth/MagicLinkVerification";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";

function Router() {
  const { login } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/reset-password">
        {() => (
          <PasswordResetForm 
            onSuccess={() => window.location.href = "/"} 
          />
        )}
      </Route>
      <Route path="/auth/magic">
        {() => (
          <MagicLinkVerification 
            onAuthSuccess={login}
            onError={() => window.location.href = "/"} 
          />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AuthGuard>
            <Router />
          </AuthGuard>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
