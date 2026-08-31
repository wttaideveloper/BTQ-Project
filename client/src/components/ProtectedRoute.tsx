import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

interface AdminGateProps {
  children: React.ReactNode;
}

function AdminGateLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#1a1f3a] via-primary to-[#0f1428]">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

/** Admin-only wrapper — redirects to /admin/login when not an admin. */
export function AdminGate({ children }: AdminGateProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AdminGateLoading />;
  }

  if (!user?.isAdmin) {
    return <Redirect to="/admin/login" />;
  }

  return <>{children}</>;
}

/** Commentator-only wrapper — admins and players are sent to the commentator login. */
export function CommentatorGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AdminGateLoading />;
  }

  if (!user?.isCommentator || user.isAdmin) {
    return <Redirect to="/commentator/login" />;
  }

  return <>{children}</>;
}

/** @deprecated Use the auth gate in App.tsx Router instead. Kept for compatibility. */
export function ProtectedRoute({
  path: _path,
  component: Component,
  adminOnly = false,
}: {
  path: string;
  component: React.ComponentType;
  adminOnly?: boolean;
}) {
  if (adminOnly) {
    return (
      <AdminGate>
        <Component />
      </AdminGate>
    );
  }
  return <Component />;
}
