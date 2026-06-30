import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";

interface AdminGateProps {
  children: React.ReactNode;
}

/** Admin-only wrapper — use inside the authenticated route tree only. */
export function AdminGate({ children }: AdminGateProps) {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return <Redirect to="/" />;
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
