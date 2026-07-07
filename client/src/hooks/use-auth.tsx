import { createContext, ReactNode, useContext, useEffect } from "react";

import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser } from "@shared/schema";
import { UpdateProfileData } from "@shared/user-validation";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setupGameSocket, closeGameSocket } from "@/lib/socket";
import { useTeamInvitationToasts } from "@/hooks/useTeamInvitationToasts";
import { useJoinRequestToasts } from "@/hooks/useJoinRequestToasts";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, RegisterData>;
  updateProfileMutation: UseMutationResult<SelectUser, Error, UpdateProfilePayload>;
};

type UpdateProfilePayload = UpdateProfileData & {
  profileImageFile?: File | null;
};

type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  bio?: string;
  country?: string;
  defaultAvatar?: string;
  profileImageFile?: File | null;
};

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // Keep WebSocket connection in sync with auth state
  useEffect(() => {
    if (user?.id) {
      // Ensure socket is connected and authenticated for this user
      setupGameSocket(user.id);
    } else {
      // No authenticated user, close any existing socket
      closeGameSocket();
    }
  }, [user?.id]);

  // Show toast when this user receives a team battle / rapid fire invitation
  useTeamInvitationToasts(user?.id);
  useJoinRequestToasts(user?.id);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.setQueryData(["/api/profile"], user);
      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterData) => {
      const { profileImageFile, ...fields } = credentials;
      let res: Response;

      if (profileImageFile) {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined && value !== "") {
            formData.append(key, String(value));
          }
        });
        formData.append("profileImage", profileImageFile);
        res = await fetch("/api/register", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
      } else {
        res = await apiRequest("POST", "/api/register", fields);
      }

      if (!res.ok) {
        const text = await res.text();
        try {
          const body = JSON.parse(text);
          throw new Error(body.message || text);
        } catch (error) {
          if (error instanceof Error && error.message !== text) {
            throw error;
          }
          throw new Error(text || res.statusText);
        }
      }

      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.setQueryData(["/api/profile"], user);
      toast({
        title: "Registration Successful",
        description: `Welcome, ${user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.setQueryData(["/api/profile"], null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const { profileImageFile, ...fields } = payload;
      let res: Response;

      if (profileImageFile) {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
          if (value !== undefined && value !== "") {
            formData.append(key, String(value));
          }
        });
        formData.append("profileImage", profileImageFile);
        res = await fetch("/api/profile", {
          method: "PATCH",
          body: formData,
          credentials: "include",
        });
      } else {
        res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
          credentials: "include",
        });
      }

      if (!res.ok) {
        const text = await res.text();
        try {
          const body = JSON.parse(text);
          throw new Error(body.message || text);
        } catch (error) {
          if (error instanceof Error && error.message !== text) {
            throw error;
          }
          throw new Error(text || res.statusText);
        }
      }

      return await res.json();
    },
    onSuccess: (updatedUser: SelectUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      queryClient.setQueryData(["/api/profile"], updatedUser);
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        updateProfileMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}