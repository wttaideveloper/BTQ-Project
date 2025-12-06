import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
  adminOnly?: boolean;
}

export function ProtectedRoute({
  path,
  component: Component,
  adminOnly = false,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Show loading state if still checking auth
  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Route>
    );
  }

  // Check auth conditions
  if (!user) {
    // Not logged in at all
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  } else if (adminOnly && !user.isAdmin) {
    // Regular user trying to access admin-only route
    return (
      <Route path={path}>
        <Redirect to="/" />
      </Route>
    );
  }

  // User is authenticated and has proper permissions
  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}