import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import holmesImagePath from '@assets/HP HOLMES.jpg';

// Form validation schemas
const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

const AuthPage: React.FC = () => {
  const [_, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState('login');

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.isAdmin) {
        setLocation('/admin');
      } else {
        setLocation('/');
      }
    }
  }, [user, setLocation]);

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // Register form
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Handle login form submission
  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  // Handle register form submission
  const onRegisterSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  return (
    <div className="min-h-screen bg-[#222338] py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left column - Form */}
        <div>
          <Card className="w-full shadow-md bg-[#222338] border-0">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="game-title text-3xl font-heading font-bold text-primary">
                Faith<span className="text-accent">IQ</span>
              </CardTitle>
              <CardDescription className="text-gray-300">
                Enter your credentials to access the game
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 bg-white border border-gray-200 shadow-md">
                  <TabsTrigger value="login" className="text-gray-700 data-[state=active]:bg-accent data-[state=active]:text-primary">Login</TabsTrigger>
                  <TabsTrigger value="register" className="text-gray-700 data-[state=active]:bg-accent data-[state=active]:text-primary">Register</TabsTrigger>
                </TabsList>

                {/* Login Tab */}
                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-200">Username</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your username" {...field} className="bg-[#353564] border-[#454580] text-white placeholder:text-gray-300" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-200">Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} className="bg-[#353564] border-[#454580] text-white placeholder:text-gray-300" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full bg-accent text-primary hover:bg-accent/90"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
                      </Button>
                      {loginMutation.isError && (
                        <div className="text-red-500 text-sm mt-2">
                          Login Error: {loginMutation.error?.message}
                        </div>
                      )}
                    </form>
                  </Form>
                </TabsContent>

                {/* Register Tab */}
                <TabsContent value="register">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-6">
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-200">Username</FormLabel>
                            <FormControl>
                              <Input placeholder="Choose a username" {...field} className="bg-[#353564] border-[#454580] text-white placeholder:text-gray-300" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-200">Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} className="bg-[#353564] border-[#454580] text-white placeholder:text-gray-300" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-200">Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} className="bg-[#353564] border-[#454580] text-white placeholder:text-gray-300" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full bg-accent text-primary hover:bg-accent/90"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? 'Creating account...' : 'Create Account'}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <div className="text-center text-sm text-gray-400">
                <p>Admin login: admin / admin123</p>
                <p>Note: New accounts created here will be player accounts</p>
                <Button 
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
                        credentials: 'include'
                      });
                      const data = await response.json();
                      console.log('Manual login response:', data);
                      alert('Manual login test: ' + (response.ok ? 'Success' : 'Failed') + 
                            '\nStatus: ' + response.status + 
                            '\nResponse: ' + JSON.stringify(data));
                      if (response.ok) {
                        queryClient.invalidateQueries({queryKey: ["/api/user"]});
                      }
                    } catch (err) {
                      console.error('Manual login error:', err);
                      alert('Manual login error: ' + (err as Error).message);
                    }
                  }}
                  className="mt-4 w-full bg-[#353564] hover:bg-[#454580] text-white border-[#454580]"
                  variant="outline"
                  size="sm"
                >
                  Debug: Test Admin Login
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Right column - Hero section */}
        <div className="hidden md:flex flex-col justify-center">
          <div className="text-center">
            <h1 className="text-5xl font-bold font-heading text-white mb-6 game-title">FaithIQ</h1>
            <div className="bg-black/30 p-6 rounded-2xl backdrop-blur-sm border border-white/10">
              <div className="mb-4 w-32 h-32 rounded-full mx-auto overflow-hidden border-4 border-accent">
                <img src={holmesImagePath} alt="Kingdom Genius Dr. HB Holmes" className="w-full h-full object-cover" />
              </div>
              <p className="text-xl font-medium text-white mb-4">Meet your host, Kingdom Genius Dr. HB Holmes</p>
              <p className="text-white mb-6">Join our exciting Bible trivia game hosted by Kingdom Genius Dr. HB Holmes. Test your knowledge, compete with friends, and earn rewards!</p>
              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="flex items-center text-accent">
                  <span className="mr-2">✓</span> Single & multiplayer modes
                </div>
                <div className="flex items-center text-accent">
                  <span className="mr-2">✓</span> Various difficulty levels
                </div>
                <div className="flex items-center text-accent">
                  <span className="mr-2">✓</span> Earn rewards as you play
                </div>
                <div className="flex items-center text-accent">
                  <span className="mr-2">✓</span> Voice narration feature
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;