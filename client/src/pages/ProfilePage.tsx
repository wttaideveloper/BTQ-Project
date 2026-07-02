import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfilePicturePicker } from "@/components/ProfilePicturePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  updateProfileSchema,
  DEFAULT_AVATARS,
  type UpdateProfileData,
} from "@shared/user-validation";
import {
  ArrowLeft,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Trophy,
  User as UserIcon,
  X,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const profileFormSchema = updateProfileSchema;

type ProfileFormValues = UpdateProfileData;

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function findDefaultAvatarId(profileImage?: string | null) {
  if (!profileImage) return DEFAULT_AVATARS[0].id;
  const match = DEFAULT_AVATARS.find((avatar) => avatar.path === profileImage);
  return match?.id ?? DEFAULT_AVATARS[0].id;
}

const ProfilePage: React.FC = () => {
  const { user, updateProfileMutation } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string>(
    DEFAULT_AVATARS[0].id
  );
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      phone: "",
      bio: "",
      country: "",
      currentPassword: "",
      newPassword: "",
    },
  });

  useEffect(() => {
    if (!user) return;

    form.reset({
      fullName: user.fullName ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      bio: user.bio ?? "",
      country: user.country ?? "",
      currentPassword: "",
      newPassword: "",
    });
    setSelectedDefaultAvatar(findDefaultAvatarId(user.profileImage));
  }, [user, form]);

  if (!user) {
    return null;
  }

  const handleEdit = () => {
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setShowPasswordSection(false);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setProfileImageFile(null);
    setProfileImagePreview(null);
    form.reset({
      fullName: user.fullName ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      bio: user.bio ?? "",
      country: user.country ?? "",
      currentPassword: "",
      newPassword: "",
    });
    setSelectedDefaultAvatar(findDefaultAvatarId(user.profileImage));
  };

  const handleProfileImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      return;
    }
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const clearProfileImage = () => {
    setProfileImageFile(null);
    setProfileImagePreview(null);
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = "";
    }
  };

  const onSubmit = (values: ProfileFormValues) => {
    updateProfileMutation.mutate(
      {
        ...values,
        defaultAvatar: profileImageFile ? undefined : selectedDefaultAvatar,
        profileImageFile,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setProfileImageFile(null);
          setProfileImagePreview(null);
          form.setValue("currentPassword", "");
          form.setValue("newPassword", "");
        },
      }
    );
  };

  const displayImage = profileImagePreview ?? user.profileImage;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading">
      <header className="sticky top-0 z-40 backdrop-blur-lg bg-[#121628]/90 border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          {!isEditing ? (
            <Button
              onClick={handleEdit}
              className="bg-accent hover:bg-accent/90 text-primary font-semibold"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                disabled={updateProfileMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={form.handleSubmit(onSubmit)}
                className="bg-accent hover:bg-accent/90 text-primary font-semibold"
                disabled={updateProfileMutation.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {updateProfileMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <section className="home-glass-card rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <UserAvatar
              profileImage={displayImage}
              fullName={user.fullName}
              username={user.username}
              className="h-24 w-24 text-2xl"
            />
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                {user.fullName || user.username}
              </h1>
              <p className="text-white/60 mt-1">@{user.username}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                {user.isAdmin && (
                  <Badge className="bg-accent text-primary">Admin</Badge>
                )}
                {user.isEmailVerified ? (
                  <Badge variant="outline" className="border-green-500/40 text-green-300">
                    Email verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-yellow-500/40 text-yellow-300">
                    Email unverified
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </section>

        {!isEditing ? (
          <>
            <section className="home-glass-card rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-accent" />
                Profile Details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  icon={Mail}
                  label="Email"
                  value={user.email || "—"}
                />
                <DetailItem
                  icon={Phone}
                  label="Phone"
                  value={user.phone || "—"}
                />
                <DetailItem
                  icon={MapPin}
                  label="Country"
                  value={user.country || "—"}
                />
              </div>
              {user.bio && (
                <div className="pt-2">
                  <p className="text-xs uppercase tracking-wide text-white/45 mb-1">
                    Bio
                  </p>
                  <p className="text-white/80 text-sm leading-relaxed">{user.bio}</p>
                </div>
              )}
            </section>

            <section className="home-glass-card rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent" />
                Game Statistics
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Games" value={user.totalGames ?? 0} />
                <StatCard label="Wins" value={user.wins ?? 0} />
                <StatCard label="Losses" value={user.losses ?? 0} />
                <StatCard label="Draws" value={user.draws ?? 0} />
              </div>
              <p className="text-xs text-white/45">
                Last login: {formatDate(user.lastLoginAt)}
              </p>
            </section>
          </>
        ) : (
          <section className="home-glass-card rounded-2xl p-6 sm:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <FormLabel className="text-white/80 text-sm mb-3 block">
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

                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Full Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="bg-white/5 border-white/15 text-white"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Username</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="bg-white/5 border-white/15 text-white"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          className="bg-white/5 border-white/15 text-white"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Phone</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            {...field}
                            className="bg-white/5 border-white/15 text-white"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Country</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="bg-white/5 border-white/15 text-white"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={4}
                          {...field}
                          className="bg-white/5 border-white/15 text-white resize-none"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <button
                  type="button"
                  onClick={() => setShowPasswordSection((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 transition-colors"
                >
                  <span>Change password (optional)</span>
                  {showPasswordSection ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showPasswordSection && (
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80">
                            Current Password
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="current-password"
                              {...field}
                              className="bg-white/5 border-white/15 text-white"
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80">
                            New Password
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                              className="bg-white/5 border-white/15 text-white"
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </form>
            </Form>
          </section>
        )}
      </main>
    </div>
  );
};

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
      <Icon className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
        <p className="text-sm text-white/85 break-words">{value}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
      <p className="text-2xl font-bold text-accent">{value}</p>
      <p className="text-xs text-white/55 mt-1">{label}</p>
    </div>
  );
}

export default ProfilePage;
