import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LogOut,
  Plus,
  Edit,
  Trash2,
  FileText,
  Sparkles,
  Download,
  Upload,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Trophy,
  Users,
  BarChart3,
  Settings,
  Mic,
  Volume2,
  Menu
} from 'lucide-react';
import { ChampionshipManagementPanel } from '@/components/admin/ChampionshipManagementPanel';
import { CHAMPIONSHIP_FOCUS_LIVE_EVENT } from '@/lib/championship-match-start-popup';
import { adminFetch, apiRequest } from '@/lib/queryClient';
import { 
  fetchQuestions, 
  createQuestion, 
  updateQuestion,
  deleteQuestion, 
  generateQuestionsAI 
} from '@/lib/trivia-api';
import { QuestionReviewPanel } from '@/components/QuestionReviewPanel';
import { UserManagementPanel } from '@/components/admin/UserManagementPanel';
import { GameStatsPanel } from '@/components/admin/GameStatsPanel';
import { GameControlPanel } from '@/components/admin/GameControlPanel';
import { AdminLeaderboardPanel } from '@/components/admin/AdminLeaderboardPanel';
import { buildQuestionsCsv, downloadCsv } from '@/lib/csv-export';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const categories = [
  "All Categories",
  "Old Testament",
  "New Testament",
  "Bible Stories",
  "Famous People",
  "Theme-Based"
];

const difficulties = ["All Difficulties", "Beginner", "Intermediate", "Advanced"];

interface Question {
  id: string;
  text: string;
  context?: string;
  category: string;
  difficulty: string;
  answers: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  description: string;
  category: string;
  labels: Record<string, string>;
  preview_url?: string;
}

/**
 * Which section the admin panel is showing, mirrored in the URL as `?tab=`.
 *
 * The active section used to live only in component state, so every refresh
 * dropped back to the default "questions" tab no matter which section was open.
 * Keeping it in the query string means a reload (and a shared/bookmarked link)
 * reopens the same section. The route itself is untouched - this is still
 * /admin/dashboard, only the search string carries the section - so routing,
 * the AdminGate and every panel below behave exactly as before.
 */
const ADMIN_TABS = ["questions", "users", "stats", "settings", "leaderboard", "championships", "voices"];
const DEFAULT_ADMIN_TAB = "questions";

function readAdminTabFromUrl(): string {
  if (typeof window === "undefined") return DEFAULT_ADMIN_TAB;
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && ADMIN_TABS.includes(tab) ? tab : DEFAULT_ADMIN_TAB;
}

const AdminPanel: React.FC = () => {
  const [, setLocation] = useLocation();
  const { logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // States
  const [activeTab, setActiveTabState] = useState<string>(readAdminTabFromUrl);
  // Switching section also records it in the URL, so a refresh stays put.
  // replaceState (not pushState) keeps the browser Back button behaving exactly
  // as it did before - it still leaves the admin panel rather than stepping
  // back through previously visited sections.
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);
  const [selectedCategory, setSelectedCategory] = useState<string>("All Categories");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("All Difficulties");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isExportingQuestions, setIsExportingQuestions] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState<boolean>(false);
  const [showEditDialog, setShowEditDialog] = useState<boolean>(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState<boolean>(false);
  const [showVoiceCloneDialog, setShowVoiceCloneDialog] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionReview, setShowQuestionReview] = useState<boolean>(false);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [championshipsResetSignal, setChampionshipsResetSignal] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const openChampionshipsLive = () => {
      setActiveTab("championships");
      setMobileSidebarOpen(false);
    };
    window.addEventListener(CHAMPIONSHIP_FOCUS_LIVE_EVENT, openChampionshipsLive);
    return () => window.removeEventListener(CHAMPIONSHIP_FOCUS_LIVE_EVENT, openChampionshipsLive);
  }, []);

  useEffect(() => {
    for (const overlay of document.querySelectorAll("[data-radix-dialog-overlay]")) {
      const group = overlay.parentElement;
      if (!group?.querySelector("[role='dialog']")) overlay.remove();
    }
  }, []);
  
  // Helpers: dedupe and shuffle for safe downloads
  const normalizeQuestionKey = (text: string) =>
    text.replace(/\s+/g, ' ').trim().toLowerCase();

  const dedupeQuestions = (list: Question[], existingQuestions: Question[] = []): Question[] => {
    const seen = new Set<string>();
    const existingKeys = new Set<string>();
    
    // Add existing DB questions to seen set
    existingQuestions.forEach(q => {
      const key = normalizeQuestionKey(q.text || '');
      existingKeys.add(key);
    });
    
    const unique: Question[] = [];
    for (const q of list) {
      const key = normalizeQuestionKey(q.text || '');
      if (!seen.has(key) && !existingKeys.has(key)) {
        seen.add(key);
        unique.push(q);
      }
    }
    return unique;
  };

  const shuffleAnswers = (
    answers: Array<{ id?: string; text: string; isCorrect: boolean }>
  ) => {
    const copy = [...answers];
    // Fisher–Yates shuffle
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const prepareForDownload = (list: Question[], existingQuestions: Question[] = []): Question[] => {
    const unique = dedupeQuestions(list, existingQuestions);
    return unique.map((q) => ({
      ...q,
      answers: shuffleAnswers(q.answers || []).map((a, idx) => ({
        id: a.id ?? String(idx),
        text: a.text,
        isCorrect: a.isCorrect,
      })),
    }));
  };

  // Form state for adding/editing questions
  const [formData, setFormData] = useState<{
    text: string;
    context: string;
    category: string;
    difficulty: string;
    answers: Array<{ text: string; isCorrect: boolean }>;
  }>({
    text: "",
    context: "",
    category: "Bible Stories",
    difficulty: "Beginner",
    answers: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  });
  
  // Form state for AI generation
  const [aiGenData, setAiGenData] = useState({
    category: "Bible Stories",
    difficulty: "Beginner",
    count: 5,
    generating: false,
  });

  // Form state for voice cloning
  const [voiceCloneData, setVoiceCloneData] = useState({
    name: "Bible Trivia Voice",
    description: "Voice clone for Bible trivia game",
    audioFile: null as File | null,
    uploading: false,
  });

  // Fetch questions
  const { 
    data: questions, 
    isLoading,
    isFetching,
    error,
    refetch 
  } = useQuery({
    queryKey: ['/api/questions', selectedCategory, selectedDifficulty, searchQuery],
    queryFn: () => fetchQuestions(selectedCategory, selectedDifficulty, searchQuery),
    staleTime: 0,
  });

  const handleRefreshQuestions = async () => {
    const result = await refetch({ throwOnError: false });
    if (result.isError) {
      toast({
        title: "Refresh failed",
        description: "Could not reload questions. Please try again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Questions refreshed",
      description: `Loaded ${result.data?.length ?? 0} question${result.data?.length === 1 ? "" : "s"}.`,
    });
  };

  const handleClearFilters = () => {
    setSelectedCategory("All Categories");
    setSelectedDifficulty("All Difficulties");
    setSearchQuery("");
  };

  const handleExportQuestionsCsv = useCallback(async () => {
    setIsExportingQuestions(true);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fallbackFilename = `faithiq-questions-${dateStamp}.csv`;
    const params = new URLSearchParams({
      category: selectedCategory,
      difficulty: selectedDifficulty,
      search: searchQuery,
    });

    try {
      const res = await adminFetch(`/api/admin/questions/export?${params}`);

      if (res.status === 401) {
        return;
      }

      if (res.ok) {
        const csv = await res.text();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        downloadCsv(csv, match?.[1] ?? fallbackFilename);
        return;
      }

      if (questions?.length) {
        downloadCsv(buildQuestionsCsv(questions), fallbackFilename);
      }
    } catch {
      if (questions?.length) {
        downloadCsv(buildQuestionsCsv(questions), fallbackFilename);
      }
    } finally {
      setIsExportingQuestions(false);
    }
  }, [questions, searchQuery, selectedCategory, selectedDifficulty]);

  // Fetch voice status
  const { 
    data: voiceStatus, 
    refetch: refetchVoiceStatus 
  } = useQuery({
    queryKey: ['/api/voice/status'],
    queryFn: async () => {
      const response = await adminFetch('/api/voice/status');
      if (!response.ok) {
        throw new Error('Failed to fetch voice status');
      }
      return response.json();
    },
  });

  // Fetch available voices
  const { 
    data: availableVoices, 
    refetch: refetchVoices,
    isLoading: voicesLoading 
  } = useQuery({
    queryKey: ['/api/voice/list'],
    queryFn: async () => {
      const response = await adminFetch('/api/voice/list');
      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }
      return response.json();
    },
    enabled: false, // Only fetch when needed
  });

  // Fetch voice usage statistics
  const { 
    data: voiceUsageStats, 
    refetch: refetchUsageStats,
    isLoading: usageStatsLoading 
  } = useQuery({
    queryKey: ['/api/voice/usage'],
    queryFn: async () => {
      const response = await adminFetch('/api/voice/usage');
      if (!response.ok) {
        throw new Error('Failed to fetch voice usage');
      }
      return response.json();
    },
    enabled: false, // Only fetch when needed
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({
        title: "Success",
        description: "Question created successfully",
      });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create question: ${error}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({
        title: "Success",
        description: "Question updated successfully",
      });
      setShowEditDialog(false);
      setEditingQuestion(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update question: ${error}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete question: ${error}`,
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: generateQuestionsAI,
    onSuccess: (data: any) => {
      // Process generated questions: dedupe against existing DB questions and shuffle answers
      const generatedQuestions = Array.isArray(data?.questions) ? data.questions : [];
      const processedQuestions = prepareForDownload(generatedQuestions, questions || []);
      
      const duplicatesRemoved = generatedQuestions.length - processedQuestions.length;
      if (duplicatesRemoved > 0) {
        toast({
          title: "Duplicates Filtered",
          description: `Removed ${duplicatesRemoved} duplicate question(s) that already exist in the database`,
          variant: "default",
        });
      }
      
      setReviewQuestions(processedQuestions);
      setShowQuestionReview(true);
      setShowGenerateDialog(false);
      setAiGenData(prev => ({ ...prev, generating: false }));
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to generate questions: ${error}`,
        variant: "destructive",
      });
      setAiGenData(prev => ({ ...prev, generating: false }));
    },
  });

  const voiceCloneMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; audioFile: File }) => {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description);
      formData.append('audio', data.audioFile);
      
      const response = await adminFetch('/api/voice/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload voice clone');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Voice clone created successfully",
      });
      setShowVoiceCloneDialog(false);
      setVoiceCloneData(prev => ({ ...prev, uploading: false, audioFile: null }));
      refetchVoiceStatus();
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create voice clone';
      
      if (errorMessage.includes('subscription')) {
        toast({
          title: "Subscription Required",
          description: "Voice cloning requires a paid ElevenLabs subscription. Please upgrade at elevenlabs.io",
          variant: "destructive",
          duration: 6000,
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
      setVoiceCloneData(prev => ({ ...prev, uploading: false }));
    },
  });

  const setActiveVoiceMutation = useMutation({
    mutationFn: async (voiceId: string) => {
      const response = await adminFetch('/api/voice/set-active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ voiceId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set active voice');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Active voice updated successfully",
      });
      refetchVoiceStatus();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to set active voice: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Form handlers
  const resetForm = () => {
    setFormData({
      text: "",
      context: "",
      category: "Bible Stories",
      difficulty: "Beginner",
      answers: [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ],
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAnswerChange = (index: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    setFormData(prev => {
      const newAnswers = [...prev.answers];
      if (field === 'isCorrect') {
        // Only one answer can be correct
        newAnswers.forEach((a, i) => {
          newAnswers[i] = { ...a, isCorrect: i === index };
        });
      } else {
        newAnswers[index] = { ...newAnswers[index], text: value as string };
      }
      return { ...prev, answers: newAnswers };
    });
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      text: question.text,
      context: question.context || "",
      category: question.category,
      difficulty: question.difficulty,
      answers: question.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect })),
    });
    setShowEditDialog(true);
  };

  const handleDeleteQuestion = (id: string) => {
    if (confirm("Are you sure you want to delete this question?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleGenerateQuestions = () => {
    setAiGenData(prev => ({ ...prev, generating: true }));
    generateMutation.mutate({
      category: aiGenData.category,
      difficulty: aiGenData.difficulty,
      count: aiGenData.count,
    });
  };

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.text.trim()) {
      toast({
        title: "Validation Error",
        description: "Question text is required",
        variant: "destructive",
      });
      return;
    }
    
    if (formData.answers.some(a => !a.text.trim())) {
      toast({
        title: "Validation Error",
        description: "All answer options must be filled",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.answers.some(a => a.isCorrect)) {
      toast({
        title: "Validation Error",
        description: "At least one answer must be marked as correct",
        variant: "destructive",
      });
      return;
    }
    
    if (editingQuestion) {
      updateMutation.mutate({
        id: editingQuestion.id,
        question: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Filtered questions
  const filteredQuestions = questions || [];

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await apiRequest('POST', '/api/questions/upload', formData);
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({
        title: "Success",
        description: "Questions uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload questions",
        variant: "destructive",
      });
    }
  };

  const goToAdminDashboard = () => {
    setActiveTab("questions");
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectAdminTab = (tab: string) => {
    if (tab === "championships") {
      setActiveTab("championships");
      setChampionshipsResetSignal(signal => signal + 1);
    } else {
      setActiveTab(tab);
    }
    setMobileSidebarOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full w-full flex-col">
      <div className="p-6 border-b border-gray-100 flex-shrink-0">
        <button
          type="button"
          onClick={goToAdminDashboard}
          className="flex items-center gap-3 w-full text-left hover:opacity-90 transition-opacity cursor-pointer"
          aria-label="Go to admin dashboard"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              FaithIQ Admin
            </h1>
            <p className="text-xs text-gray-500">Bible Trivia Management</p>
          </div>
        </button>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-2">
          <button
            onClick={() => selectAdminTab("questions")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeTab === "questions"
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <FileText size={20} />
            <span className="font-medium">Question Management</span>
          </button>

          <button
            onClick={() => selectAdminTab("users")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeTab === "users"
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Users size={20} />
            <span className="font-medium">User Management</span>
          </button>

          <button
            onClick={() => selectAdminTab("stats")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeTab === "stats"
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <BarChart3 size={20} />
            <span className="font-medium">Game Statistics</span>
          </button>

          <button
            onClick={() => selectAdminTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeTab === "settings"
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Settings size={20} />
            <span className="font-medium">Game Control</span>
          </button>

          <button
            onClick={() => selectAdminTab("championships")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === "championships" ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
          >
            <Trophy size={20} /><span className="font-medium">Championships</span>
          </button>

          <button
            onClick={() => selectAdminTab("leaderboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeTab === "leaderboard"
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Trophy size={20} />
            <span className="font-medium">Leaderboard</span>
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100 flex-shrink-0">
        <Button
          variant="outline"
          className="w-full flex items-center gap-2 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
          disabled={logoutMutation.isPending}
          onClick={() => {
            logoutMutation.mutate(undefined, {
              onSuccess: () => setLocation("/admin/login"),
            });
          }}
        >
          <LogOut size={18} /> Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 flex">
      {/* Fixed Sidebar */}
      <aside className="hidden md:fixed md:flex md:h-screen md:w-64 md:flex-col md:border-r md:border-gray-200 md:bg-white md:shadow-lg">
        {renderSidebarContent()}
      </aside>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Admin navigation</SheetTitle>
            <SheetDescription>Choose an admin section or log out.</SheetDescription>
          </SheetHeader>
          {renderSidebarContent()}
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col bg-slate-50 md:ml-64 md:h-screen">
        {/* Top Navbar */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Open admin navigation">
                <Menu size={22} />
              </Button>
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={goToAdminDashboard}
                  className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
                  aria-label="Go to admin dashboard"
                >
                  <Trophy className="w-6 h-6 text-white" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
                    {activeTab === "questions" && "Question Management"}
                    {activeTab === "users" && "User Management"}
                    {activeTab === "stats" && "Game Statistics"}
                    {activeTab === "settings" && "Game Control"}
                    {activeTab === "leaderboard" && "Leaderboard"}
                    {activeTab === "championships" && "Championship Management"}
                  </h1>
                  <p className="text-xs text-gray-600 md:text-sm">
                    {activeTab === "questions" && "Manage your Bible trivia questions and content"}
                    {activeTab === "users" && "View registered users, profiles, and activity status"}
                    {activeTab === "stats" && "Live platform metrics and game activity"}
                    {activeTab === "settings" && "Configure game parameters and behavior"}
                    {activeTab === "leaderboard" && "View top players across solo and multiplayer games"}
                    {activeTab === "championships" && "Manage teams, matches, streaming, and live operations"}
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                FaithIQ Admin
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 min-w-0 overflow-auto bg-slate-50 p-3 sm:p-4 md:p-6">
          {/* Content Container */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

            {/* Questions Tab Content */}
            {activeTab === "questions" && (
              <div className="flex flex-col h-full">
                {/* Fixed Filters Section */}
                <div className="bg-gray-50 rounded-xl p-6 mb-6 flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Filter Questions</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="relative">
                      <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Search questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                      <SelectTrigger className="bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                        <SelectValue placeholder="Difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        {difficulties.map((diff) => (
                          <SelectItem key={diff} value={diff}>
                            {diff}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={handleClearFilters}
                        variant="outline"
                        className="flex-1 bg-white border-gray-200 hover:bg-gray-50"
                      >
                        Clear
                      </Button>
                      <Button
                        type="button"
                        onClick={handleRefreshQuestions}
                        variant="outline"
                        disabled={isFetching}
                        className="flex-1 flex items-center justify-center gap-2 bg-white border-gray-200 hover:bg-gray-50"
                      >
                        <RefreshCw
                          size={16}
                          className={isFetching ? "animate-spin" : ""}
                        />
                        {isFetching ? "Refreshing…" : "Refresh"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Fixed Action Buttons */}
                <div className="flex flex-wrap gap-3 mb-6 flex-shrink-0">
                  <Button 
                    onClick={() => {
                      resetForm();
                      setShowAddDialog(true);
                    }} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-sm"
                  >
                    <Plus size={18} /> Add Question
                  </Button>
                  
                  <Button 
                    onClick={() => setShowGenerateDialog(true)}
                    variant="secondary" 
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                  >
                    <Sparkles size={18} /> Generate with AI
                  </Button>
                  
                  <Button 
                    onClick={() => {
                      if (!questions?.length) return;
                      const processed = prepareForDownload(questions, []);
                      const dataStr = JSON.stringify(processed, null, 2);
                      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                      const exportFileDefaultName = 'bible-trivia-questions.json';
                      const linkElement = document.createElement('a');
                      linkElement.setAttribute('href', dataUri);
                      linkElement.setAttribute('download', exportFileDefaultName);
                      linkElement.click();
                    }}
                    variant="outline" 
                    className="flex items-center gap-2 hover:bg-green-50 hover:border-green-500"
                    disabled={!questions?.length}
                  >
                    <Download size={18} /> Export JSON
                  </Button>

                  <Button
                    onClick={handleExportQuestionsCsv}
                    variant="outline"
                    className="flex items-center gap-2 hover:bg-green-50 hover:border-green-500"
                    disabled={isExportingQuestions || !questions?.length}
                  >
                    <Download
                      size={18}
                      className={isExportingQuestions ? "animate-pulse" : ""}
                    />
                    Export CSV
                  </Button>

                  {reviewQuestions.length > 0 && (
                    <Button 
                      onClick={() => {
                        const processed = prepareForDownload(reviewQuestions, questions || []);
                        const dataStr = JSON.stringify(processed, null, 2);
                        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                        const exportFileDefaultName = 'ai-generated-questions.json';
                        const linkElement = document.createElement('a');
                        linkElement.setAttribute('href', dataUri);
                        linkElement.setAttribute('download', exportFileDefaultName);
                        linkElement.click();
                      }}
                      variant="outline" 
                      className="flex items-center gap-2 hover:bg-indigo-50 hover:border-indigo-500"
                    >
                      <Download size={18} /> Export Generated
                    </Button>
                  )}
                </div>

                {/* Scrollable Table Container */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                  {isLoading ? (
                    <div className="flex justify-center items-center p-12 flex-1">
                      <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                        <p className="text-gray-600">Loading questions...</p>
                      </div>
                    </div>
                  ) : error ? (
                    <div className="text-center p-12 flex-1">
                      <XCircle size={48} className="mx-auto text-red-500 mb-4" />
                      <p className="text-red-600 font-medium">Error loading questions</p>
                      <p className="text-gray-500 mt-2">Please try again later</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={handleRefreshQuestions}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : filteredQuestions.length === 0 ? (
                    <div className="text-center p-12 flex-1">
                      <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 font-medium">No questions found</p>
                      <p className="text-gray-500 mt-2">Add some questions or adjust your filters</p>
                    </div>
                  ) : (
                    <div className={`flex-1 overflow-auto ${isFetching ? "opacity-70" : ""}`}>
                      <Table>
                        <TableHeader className="sticky top-0 bg-white z-10">
                          <TableRow className="bg-gray-50 hover:bg-gray-50">
                            <TableHead className="font-semibold text-gray-700">Question</TableHead>
                            <TableHead className="font-semibold text-gray-700">Category</TableHead>
                            <TableHead className="font-semibold text-gray-700">Difficulty</TableHead>
                            <TableHead className="font-semibold text-gray-700 w-[120px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredQuestions.map((question, index) => (
                            <TableRow key={question.id} className="hover:bg-gray-50/50 transition-colors">
                              <TableCell className="max-w-[400px]">
                                <div className="truncate" title={question.text}>
                                  {question.text}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {question.category}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  question.difficulty === 'Beginner' ? 'bg-green-100 text-green-800' :
                                  question.difficulty === 'Intermediate' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {question.difficulty}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => handleEditQuestion(question)}
                                    className="hover:bg-blue-50 hover:text-blue-600"
                                  >
                                    <Edit size={16} />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => handleDeleteQuestion(question.id)}
                                    className="hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  
                  {/* Fixed Footer */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex-shrink-0">
                    <p className="text-sm text-gray-600 font-medium">
                      Total Questions: <span className="text-blue-600">{filteredQuestions.length}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="p-4 md:p-8">
                <UserManagementPanel />
              </div>
            )}

            {/* Stats Tab Content */}
            {activeTab === "stats" && (
              <div className="p-4 md:p-8">
                <GameStatsPanel />
              </div>
            )}

            {/* Game Control Tab Content */}
            {activeTab === "settings" && (
              <div className="p-4 md:p-8">
                <GameControlPanel />
              </div>
            )}

            {activeTab === "leaderboard" && (
              <div className="p-4 md:p-8">
                <AdminLeaderboardPanel />
              </div>
            )}
            {activeTab === "championships" && <ChampionshipManagementPanel resetSignal={championshipsResetSignal} />}

            {/* Voices Tab Content */}
            {activeTab === "voices" && (
              <div className="p-4 md:p-8">
                <div className="space-y-6">
                  {/* Current Voice Status */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Mic size={24} className="text-orange-500" />
                        Current Voice Status
                      </CardTitle>
                      <CardDescription>
                        Manage the voice used for game narration
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {voiceStatus?.hasVoiceClone ? (
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-green-800">Active Voice: {voiceStatus.name}</h4>
                              <p className="text-sm text-green-600 mt-1">{voiceStatus.description}</p>
                              <p className="text-xs text-green-500 mt-2">Voice ID: {voiceStatus.voiceId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                Active
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-yellow-800">No Active Voice</h4>
                              <p className="text-sm text-yellow-600 mt-1">Upload a voice clone or select from available voices</p>
                            </div>
                            <Button 
                              onClick={() => setShowVoiceCloneDialog(true)}
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700"
                            >
                              <Mic size={16} className="mr-2" />
                              Upload Voice Clone
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Credit Usage Monitoring */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <BarChart3 size={24} className="text-purple-500" />
                        Credit Usage Monitoring
                      </CardTitle>
                      <CardDescription>
                        Track ElevenLabs credit usage and costs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => refetchUsageStats()}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                            disabled={usageStatsLoading}
                          >
                            <RefreshCw size={16} className={usageStatsLoading ? "animate-spin" : ""} />
                            {usageStatsLoading ? "Loading..." : "Refresh Stats"}
                          </Button>
                          <Select defaultValue="month" onValueChange={(value) => refetchUsageStats()}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="day">Last Day</SelectItem>
                              <SelectItem value="week">Last Week</SelectItem>
                              <SelectItem value="month">Last Month</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-sm text-gray-500">
                          💡 Each TTS request consumes credits
                        </div>
                      </div>

                      {usageStatsLoading ? (
                        <div className="flex justify-center items-center p-8">
                          <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                            <p className="text-gray-600">Loading usage statistics...</p>
                          </div>
                        </div>
                      ) : voiceUsageStats ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h4 className="font-semibold text-blue-800">Total Requests</h4>
                            <p className="text-2xl font-bold text-blue-600">{voiceUsageStats.totalRequests}</p>
                            <p className="text-sm text-blue-600">TTS requests made</p>
                          </div>
                          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h4 className="font-semibold text-green-800">Characters Processed</h4>
                            <p className="text-2xl font-bold text-green-600">{voiceUsageStats.totalCharacters.toLocaleString()}</p>
                            <p className="text-sm text-green-600">Total characters</p>
                          </div>
                          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                            <h4 className="font-semibold text-purple-800">Estimated Credits</h4>
                            <p className="text-2xl font-bold text-purple-600">{voiceUsageStats.estimatedCredits}</p>
                            <p className="text-sm text-purple-600">Credits consumed</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-8">
                          <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
                          <p className="text-gray-600 font-medium">No usage data available</p>
                          <p className="text-gray-500 mt-2">Click "Refresh Stats" to load usage statistics</p>
                        </div>
                      )}

                      {voiceUsageStats?.requestsByType && Object.keys(voiceUsageStats.requestsByType).length > 0 && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-gray-800 mb-3">Usage by Request Type</h4>
                          <div className="space-y-2">
                            {Object.entries(voiceUsageStats.requestsByType).map(([type, count]) => (
                              <div key={type} className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 capitalize">{type}</span>
                                <span className="text-sm font-medium text-gray-800">{count as number} requests</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {voiceStatus?.subscription && (
                        <div className="mt-4 bg-orange-50 p-4 rounded-lg border border-orange-200">
                          <h4 className="font-semibold text-orange-800 mb-2">ElevenLabs Subscription Info</h4>
                          <div className="text-sm text-orange-700">
                            <p><strong>Plan:</strong> {voiceStatus.subscription.tier || 'Unknown'}</p>
                            <p><strong>Character Count:</strong> {voiceStatus.subscription.character_count?.toLocaleString() || 'Unknown'}</p>
                            <p><strong>Character Limit:</strong> {voiceStatus.subscription.character_limit?.toLocaleString() || 'Unknown'}</p>
                            <p><strong>Can Extend Character Limit:</strong> {voiceStatus.subscription.can_extend_character_limit ? 'Yes' : 'No'}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Available Voices */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Volume2 size={24} className="text-blue-500" />
                        Available Voices
                      </CardTitle>
                      <CardDescription>
                        Select from available ElevenLabs voices or upload your own
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center mb-4">
                        <Button 
                          onClick={() => refetchVoices()}
                          variant="outline"
                          className="flex items-center gap-2"
                          disabled={voicesLoading}
                        >
                          <RefreshCw size={16} className={voicesLoading ? "animate-spin" : ""} />
                          {voicesLoading ? "Loading..." : "Refresh Voices"}
                        </Button>
                        <Button 
                          onClick={() => setShowVoiceCloneDialog(true)}
                          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
                        >
                          <Mic size={16} />
                          Upload Voice Clone
                        </Button>
                      </div>

                      {voicesLoading ? (
                        <div className="flex justify-center items-center p-8">
                          <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                            <p className="text-gray-600">Loading available voices...</p>
                          </div>
                        </div>
                      ) : availableVoices?.voices ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {availableVoices.voices.map((voice: ElevenLabsVoice) => (
                            <div 
                              key={voice.voice_id} 
                              className={`p-4 rounded-lg border-2 transition-all ${
                                voiceStatus?.voiceId === voice.voice_id 
                                  ? 'border-green-500 bg-green-50' 
                                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-gray-800 truncate">{voice.name}</h4>
                                {voiceStatus?.voiceId === voice.voice_id && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{voice.description}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500 capitalize">
                                  {voice.category}
                                </span>
                                {voiceStatus?.voiceId !== voice.voice_id && (
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setActiveVoiceMutation.mutate(voice.voice_id)}
                                    disabled={setActiveVoiceMutation.isPending}
                                    className="text-xs"
                                  >
                                    {setActiveVoiceMutation.isPending ? "Setting..." : "Set Active"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center p-8">
                          <Volume2 size={48} className="mx-auto text-gray-400 mb-4" />
                          <p className="text-gray-600 font-medium">No voices available</p>
                          <p className="text-gray-500 mt-2">Click "Refresh Voices" to load available voices from ElevenLabs</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Question Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add New Question</DialogTitle>
            <DialogDescription>
              Create a new Bible trivia question with multiple choice answers
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmitQuestion}>
            <div className="space-y-6 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Question Text</label>
                <Textarea
                  name="text"
                  value={formData.text}
                  onChange={handleInputChange}
                  placeholder="Enter the question text"
                  className="min-h-[100px] border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Context (Optional)</label>
                <Textarea
                  name="context"
                  value={formData.context}
                  onChange={handleInputChange}
                  placeholder="Add context or hint for the question"
                  className="min-h-[80px] border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Category</label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== "All Categories").map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Difficulty</label>
                  <Select 
                    value={formData.difficulty} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                  >
                    <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {difficulties.map(diff => (
                        <SelectItem key={diff} value={diff}>{diff}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Answer Options</label>
                <p className="text-xs text-gray-500 mb-4">
                  Add 4 options and mark the correct one
                </p>
                
                <div className="space-y-3">
                  {formData.answers.map((answer, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Input
                        value={answer.text}
                        onChange={(e) => handleAnswerChange(index, 'text', e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        className="flex-1 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        required
                      />
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={answer.isCorrect}
                          onChange={() => handleAnswerChange(index, 'isCorrect', true)}
                          className="mr-2 text-blue-500 focus:ring-blue-500"
                        />
                        <label className="text-sm font-medium text-gray-700">Correct</label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <DialogFooter className="pt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
                className="border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {createMutation.isPending ? "Saving..." : "Add Question"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Question</DialogTitle>
            <DialogDescription>
              Update the Bible trivia question details
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmitQuestion}>
            <div className="space-y-6 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Question Text</label>
                <Textarea
                  name="text"
                  value={formData.text}
                  onChange={handleInputChange}
                  placeholder="Enter the question text"
                  className="min-h-[100px] border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Context (Optional)</label>
                <Textarea
                  name="context"
                  value={formData.context}
                  onChange={handleInputChange}
                  placeholder="Add context or hint for the question"
                  className="min-h-[80px] border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Category</label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== "All Categories").map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Difficulty</label>
                  <Select 
                    value={formData.difficulty} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                  >
                    <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {difficulties.map(diff => (
                        <SelectItem key={diff} value={diff}>{diff}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Answer Options</label>
                <p className="text-xs text-gray-500 mb-4">
                  Add 4 options and mark the correct one
                </p>
                
                <div className="space-y-3">
                  {formData.answers.map((answer, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Input
                        value={answer.text}
                        onChange={(e) => handleAnswerChange(index, 'text', e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        className="flex-1 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        required
                      />
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={answer.isCorrect}
                          onChange={() => handleAnswerChange(index, 'isCorrect', true)}
                          className="mr-2 text-blue-500 focus:ring-blue-500"
                        />
                        <label className="text-sm font-medium text-gray-700">Correct</label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <DialogFooter className="pt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingQuestion(null);
                  resetForm();
                }}
                className="border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {updateMutation.isPending ? "Saving..." : "Update Question"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate with AI Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Sparkles size={24} className="text-purple-500" />
              Generate with AI
            </DialogTitle>
            <DialogDescription>
              Use AI to generate Bible trivia questions based on your criteria
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Category</label>
              <Select 
                value={aiGenData.category} 
                onValueChange={(value) => setAiGenData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c !== "All Categories").map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Difficulty</label>
              <Select 
                value={aiGenData.difficulty} 
                onValueChange={(value) => setAiGenData(prev => ({ ...prev, difficulty: value }))}
              >
                <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficulties.map(diff => (
                    <SelectItem key={diff} value={diff}>{diff}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Number of Questions</label>
              <Select 
                value={aiGenData.count.toString()} 
                onValueChange={(value) => setAiGenData(prev => ({ ...prev, count: parseInt(value) }))}
              >
                <SelectTrigger className="border-gray-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 5, 10, 15, 20, 25, 30, 40, 50, 100].map(num => (
                    <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-700">
                AI will generate multiple-choice questions based on your selected criteria.
                Each question will have one correct answer.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowGenerateDialog(false)}
              className="border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateQuestions}
              disabled={aiGenData.generating || generateMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 shadow-sm"
            >
              {aiGenData.generating ? (
                <>
                  <RefreshCw size={16} className="animate-spin mr-2" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" /> Generate Questions
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voice Clone Dialog */}
      <Dialog open={showVoiceCloneDialog} onOpenChange={setShowVoiceCloneDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Mic size={24} className="text-orange-500" />
              Upload Voice Clone
            </DialogTitle>
            <DialogDescription>
              Upload an audio sample to create a voice clone using ElevenLabs AI
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Voice Name</label>
              <Input
                value={voiceCloneData.name}
                onChange={(e) => setVoiceCloneData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter voice name"
                className="border-gray-200 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Description</label>
              <Textarea
                value={voiceCloneData.description}
                onChange={(e) => setVoiceCloneData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter voice description"
                className="min-h-[80px] border-gray-200 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Audio Sample</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-orange-500 transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setVoiceCloneData(prev => ({ ...prev, audioFile: file }));
                    }
                  }}
                  className="hidden"
                  id="audio-upload"
                />
                <label htmlFor="audio-upload" className="cursor-pointer block">
                  <Mic size={32} className="mx-auto text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600 mb-1">
                    {voiceCloneData.audioFile ? voiceCloneData.audioFile.name : "Click to select audio file"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Supported formats: MP3, WAV, M4A (max 25MB)
                  </p>
                  {voiceCloneData.audioFile && (
                    <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-700 font-medium">
                        ✓ File selected: {(voiceCloneData.audioFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-800 mb-2">Voice Cloning Tips:</h4>
              <ul className="text-sm text-orange-700 space-y-1">
                <li>• Use clear, high-quality audio (5-10 minutes recommended)</li>
                <li>• Speak naturally and consistently</li>
                <li>• Avoid background noise</li>
                <li>• Include various speech patterns and emotions</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowVoiceCloneDialog(false)}
              className="border-gray-200 hover:bg-gray-50 w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!voiceCloneData.audioFile) {
                  toast({
                    title: "Error",
                    description: "Please select an audio file",
                    variant: "destructive",
                  });
                  return;
                }
                
                setVoiceCloneData(prev => ({ ...prev, uploading: true }));
                voiceCloneMutation.mutate({
                  name: voiceCloneData.name,
                  description: voiceCloneData.description,
                  audioFile: voiceCloneData.audioFile,
                });
              }}
              disabled={voiceCloneData.uploading || voiceCloneMutation.isPending || !voiceCloneData.audioFile}
              className="bg-orange-600 hover:bg-orange-700 shadow-sm w-full sm:w-auto"
            >
              {voiceCloneData.uploading ? (
                <>
                  <RefreshCw size={16} className="animate-spin mr-2" /> Uploading...
                </>
              ) : (
                <>
                  <Mic size={16} className="mr-2" /> Create Voice Clone
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Review Panel */}
      {showQuestionReview && (
        <QuestionReviewPanel
          questions={reviewQuestions}
          onQuestionsStored={(storedQuestions) => {
            setShowQuestionReview(false);
            setReviewQuestions([]);
            queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
            toast({
              title: "Success",
              description: `Successfully stored ${storedQuestions.length} questions`,
            });
          }}
          onClose={() => {
            setShowQuestionReview(false);
            setReviewQuestions([]);
          }}
        />
      )}
    </div>
  );
};

export default AdminPanel;
