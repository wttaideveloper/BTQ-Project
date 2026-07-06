import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ProfilePicturePicker } from '@/components/ProfilePicturePicker';
import {
  Users,
  Target,
  Trophy,
  Sparkles,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import holmesImagePath from '@assets/HP HOLMES.jpg';
import { registerUserSchema, DEFAULT_AVATARS } from '@shared/user-validation';

const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = registerUserSchema
  .extend({
    confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

const FEATURES = [
  { icon: Users, label: 'Single & multiplayer modes' },
  { icon: Target, label: 'Various difficulty levels' },
  { icon: Trophy, label: 'Earn rewards as you play' },
  { icon: Sparkles, label: 'Voice narration feature' },
] as const;

const inputClassName =
  'bg-white/5 border-white/15 text-white placeholder:text-white/40 rounded-xl h-11 focus-visible:ring-accent focus-visible:border-accent/50';

const AuthPage: React.FC = () => {
  const [_, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOptionalProfile, setShowOptionalProfile] = useState(false);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string>(DEFAULT_AVATARS[0].id);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const profileImageInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setLocation(user.isAdmin ? '/admin' : '/');
    }
  }, [user, setLocation]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      bio: '',
      country: '',
      defaultAvatar: DEFAULT_AVATARS[0].id,
    },
  });

  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate({
      fullName: values.fullName,
      username: values.username,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
      bio: values.bio || undefined,
      country: values.country || undefined,
      defaultAvatar: profileImageFile ? undefined : selectedDefaultAvatar,
      profileImageFile,
    });
  };

  const handleProfileImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const clearProfileImage = () => {
    setProfileImageFile(null);
    setProfileImagePreview(null);
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = '';
    }
  };

  const PasswordToggle = ({
    visible,
    onToggle,
  }: {
    visible: boolean;
    onToggle: () => void;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80 transition-colors"
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading overflow-x-hidden">
      {/* Header — matches Home */}
      <header className="sticky top-0 z-40 backdrop-blur-lg bg-[#121628]/90 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center sm:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-primary font-bold text-lg">F</span>
            </div>
            <span className="game-title text-xl font-bold text-white">
              Faith<span className="text-accent">IQ</span>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Hero — right column on desktop; below form on mobile */}
          <section className="order-2 lg:order-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
            <div className="text-center lg:text-left">
              <h1 className="game-title text-4xl sm:text-5xl font-bold font-heading text-white mb-4">
                Faith<span >IQ</span>
              </h1>
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
                Test your{' '}
                <span className="text-accent">Bible knowledge</span>
              </h2>
              <p className="text-white/75 text-base sm:text-lg mb-8 max-w-md mx-auto lg:mx-0">
                Join our exciting trivia game hosted by Kingdom Genius Dr. HB
                Holmes. Compete with friends and earn rewards!
              </p>

              <div className="flex justify-center lg:justify-start mb-8">
                <div className="relative text-center">
                  <div
                    className="absolute inset-0 bg-accent/20 rounded-full blur-2xl scale-125 animate-pulse"
                    aria-hidden
                  />
                  <div className="relative z-10">
                    <img
                      src={holmesImagePath}
                      alt="Kingdom Genius Dr. HB Holmes"
                      className="w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-4 border-accent shadow-2xl mx-auto"
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-accent text-primary px-4 py-1 rounded-full font-bold text-xs whitespace-nowrap shadow-lg">
                      Dr. HB Holmes
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-glass-card rounded-2xl p-5 sm:p-6">
                <p className="text-white font-semibold mb-4 text-sm sm:text-base">
                  What you&apos;ll get
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FEATURES.map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="flex items-center gap-2.5 text-sm text-white/80"
                    >
                      <span className="flex-shrink-0 w-8 h-8 rounded-lg home-icon-gold flex items-center justify-center">
                        <Icon className="h-4 w-4" />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Auth form — first on mobile, left column on desktop */}
          <section className="order-1 lg:order-1 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
            <div className="home-glass-card rounded-2xl p-6 sm:p-8 max-w-md mx-auto lg:mx-0 lg:max-w-none w-full">
              <div className="mb-6 text-center lg:text-left">
                <h2 className="text-xl font-bold text-white/90 mb-1">
                  {activeTab === 'login' ? 'Sign in' : 'Create account'}
                </h2>
                <p className="text-white/55 text-sm">
                  {activeTab === 'login'
                    ? 'Enter your credentials to start playing'
                    : 'Set up a free player account in seconds'}
                </p>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/5 border border-white/10 p-1 rounded-xl h-auto">
                  <TabsTrigger
                    value="login"
                    className={cn(
                      'rounded-lg py-2.5 text-sm font-semibold transition-all',
                      'text-white/60 data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-md'
                    )}
                  >
                    <LogIn className="h-4 w-4 mr-1.5 inline-block" />
                    Login
                  </TabsTrigger>
                  <TabsTrigger
                    value="register"
                    className={cn(
                      'rounded-lg py-2.5 text-sm font-semibold transition-all',
                      'text-white/60 data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-md'
                    )}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5 inline-block" />
                    Register
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-0">
                  <Form {...loginForm}>
                    <form
                      onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                      className="space-y-5"
                    >
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Username
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your username"
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
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Password
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showLoginPassword ? 'text' : 'password'}
                                  placeholder="Enter your password"
                                  autoComplete="current-password"
                                  {...field}
                                  className={cn(inputClassName, 'pr-10')}
                                />
                                <PasswordToggle
                                  visible={showLoginPassword}
                                  onToggle={() =>
                                    setShowLoginPassword((v) => !v)
                                  }
                                />
                              </div>
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />

                      {loginMutation.isError && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/25 px-3 py-2.5 text-sm text-red-300">
                          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span>
                            {loginMutation.error?.message ||
                              'Login failed. Check your username and password.'}
                          </span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        className="w-full bg-accent hover:bg-accent/90 text-primary font-bold h-12 rounded-xl shadow-lg shadow-accent/20"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="register" className="mt-0">
                  <Form {...registerForm}>
                    <form
                      onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                      className="space-y-4"
                    >
                      <FormField
                        control={registerForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Full Name <span className="text-accent">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Your full name"
                                autoComplete="name"
                                {...field}
                                className={inputClassName}
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Username <span className="text-accent">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Choose a username"
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
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Email <span className="text-accent">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                {...field}
                                className={inputClassName}
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Password <span className="text-accent">*</span>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={
                                    showRegisterPassword ? 'text' : 'password'
                                  }
                                  placeholder="At least 6 characters"
                                  autoComplete="new-password"
                                  {...field}
                                  className={cn(inputClassName, 'pr-10')}
                                />
                                <PasswordToggle
                                  visible={showRegisterPassword}
                                  onToggle={() =>
                                    setShowRegisterPassword((v) => !v)
                                  }
                                />
                              </div>
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/80 text-sm">
                              Confirm Password <span className="text-accent">*</span>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={
                                    showConfirmPassword ? 'text' : 'password'
                                  }
                                  placeholder="Re-enter your password"
                                  autoComplete="new-password"
                                  {...field}
                                  className={cn(inputClassName, 'pr-10')}
                                />
                                <PasswordToggle
                                  visible={showConfirmPassword}
                                  onToggle={() =>
                                    setShowConfirmPassword((v) => !v)
                                  }
                                />
                              </div>
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />

                      <button
                        type="button"
                        onClick={() => setShowOptionalProfile((v) => !v)}
                        className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 transition-colors"
                      >
                        <span>Add optional profile details</span>
                        {showOptionalProfile ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {showOptionalProfile && (
                        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                          <FormField
                            control={registerForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-white/80 text-sm">
                                  Phone Number
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="tel"
                                    inputMode="numeric"
                                    placeholder="10-digit phone number"
                                    autoComplete="tel"
                                    maxLength={10}
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(
                                        e.target.value.replace(/\D/g, "").slice(0, 10)
                                      );
                                    }}
                                    className={inputClassName}
                                  />
                                </FormControl>
                                <FormMessage className="text-red-400" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="country"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-white/80 text-sm">
                                  Country
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="text"
                                    placeholder="India"
                                    autoComplete="country-name"
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(
                                        e.target.value.replace(/[^a-zA-Z\s\-'.]/g, "")
                                      );
                                    }}
                                    className={inputClassName}
                                  />
                                </FormControl>
                                <FormMessage className="text-red-400" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="bio"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-white/80 text-sm">
                                  Bio
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Tell us a little about yourself (optional)"
                                    rows={3}
                                    {...field}
                                    className="bg-white/5 border-white/15 text-white placeholder:text-white/40 rounded-xl focus-visible:ring-accent focus-visible:border-accent/50 resize-none"
                                  />
                                </FormControl>
                                <FormMessage className="text-red-400" />
                              </FormItem>
                            )}
                          />

                          <div className="space-y-3">
                            <FormLabel className="text-white/80 text-sm">
                              Profile Picture
                            </FormLabel>
                            <ProfilePicturePicker
                              selectedDefaultAvatar={selectedDefaultAvatar}
                              onSelectDefaultAvatar={setSelectedDefaultAvatar}
                              profileImagePreview={profileImagePreview}
                              profileImageFile={profileImageFile}
                              onFileChange={handleProfileImageChange}
                              onClearUpload={clearProfileImage}
                              inputRef={profileImageInputRef}
                              variant="dark"
                            />
                          </div>
                        </div>
                      )}

                      {registerMutation.isError && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/25 px-3 py-2.5 text-sm text-red-300">
                          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span>
                            {registerMutation.error?.message ||
                              'Registration failed. Please check your details and try again.'}
                          </span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        className="w-full bg-accent hover:bg-accent/90 text-primary font-bold h-12 rounded-xl shadow-lg shadow-accent/20"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending
                          ? 'Creating account…'
                          : 'Create Account'}
                      </Button>

                      <p className="text-center text-xs text-white/45">
                        Required fields are marked with *
                      </p>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AuthPage;
