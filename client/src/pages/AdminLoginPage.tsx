import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AlertCircle, Eye, EyeOff, LogIn, Shield, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

const inputClassName =
  "bg-white/5 border-white/15 text-white placeholder:text-white/40 rounded-xl h-11 focus-visible:ring-accent focus-visible:border-accent/50";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, logoutMutation, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user?.isAdmin) {
      setLocation("/admin/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (values: AdminLoginValues) => {
    setAdminError(null);
    loginMutation.mutate(values, {
      onSuccess: (loggedInUser) => {
        if (!loggedInUser.isAdmin) {
          setAdminError("This account does not have admin access.");
          logoutMutation.mutate();
          return;
        }
        setLocation("/admin/dashboard");
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading flex flex-col">
      <header className="border-b border-white/10 bg-[#121628]/90 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-primary font-bold text-lg">F</span>
            </div>
            <span className="text-xl font-bold text-white">
              Faith<span className="text-accent">IQ</span>
            </span>
          </div>
          {/*
          <Button
            variant="ghost"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Player site
          </Button>
          */}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/15 text-accent mb-4">
              <Shield className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
            <p className="text-white/60 text-sm">
              Sign in with an administrator account to manage questions, users,
              and voice settings.
            </p>
          </div>

          <div className="home-glass-card rounded-2xl p-6 sm:p-8 border border-white/10">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">
                        Admin username
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter admin username"
                          autoComplete="username"
                          {...field}
                          className={inputClassName}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">
                        Password
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter password"
                            autoComplete="current-password"
                            {...field}
                            className={cn(inputClassName, "pr-10")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {(adminError || loginMutation.isError) && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/25 px-3 py-2.5 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      {adminError ||
                        loginMutation.error?.message ||
                        "Login failed. Check your credentials."}
                    </span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent/90 text-primary font-bold h-12 rounded-xl"
                  disabled={loginMutation.isPending}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {loginMutation.isPending ? "Signing in…" : "Sign in to Admin"}
                </Button>
              </form>
            </Form>

            <p className="text-center text-xs text-white/45 mt-6">
              Player login?{" "}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => setLocation("/auth")}
              >
                Go to game sign in
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
