import React, { useState } from 'react';
import { Link } from 'wouter';
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
  Home,
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
  Volume2
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { 
  fetchQuestions, 
  createQuestion, 
  updateQuestion,
  deleteQuestion, 
  generateQuestionsAI 
} from '@/lib/trivia-api';
import { QuestionReviewPanel } from '@/components/QuestionReviewPanel';

const categories = [
  "All Categories",
  "Old Testament",
  "New Testament",
  "Bible Stories",
  "Famous People",
  "Theme-Based"
];

const difficulties = ["Beginner", "Intermediate", "Advanced"];

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

const AdminPanel: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // States
  const [activeTab, setActiveTab] = useState<string>("questions");
  const [selectedCategory, setSelectedCategory] = useState<string>("All Categories");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("Beginner");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState<boolean>(false);
  const [showEditDialog, setShowEditDialog] = useState<boolean>(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState<boolean>(false);
  const [showVoiceCloneDialog, setShowVoiceCloneDialog] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionReview, setShowQuestionReview] = useState<boolean>(false);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  
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
    error,
    refetch 
  } = useQuery({
    queryKey: ['/api/questions', selectedCategory, selectedDifficulty, searchQuery],
    queryFn: () => fetchQuestions(selectedCategory, selectedDifficulty, searchQuery),
  });

  // Fetch voice status
  const { 
    data: voiceStatus, 
    refetch: refetchVoiceStatus 
  } = useQuery({
    queryKey: ['/api/voice/status'],
    queryFn: async () => {
      const response = await fetch('/api/voice/status');
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
      const response = await fetch('/api/voice/list');
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
      const response = await fetch('/api/voice/usage');
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
      
      const response = await fetch('/api/voice/upload', {
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
      const response = await fetch('/api/voice/set-active', {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex">
      {/* Fixed Sidebar */}
      <div className="w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col fixed h-screen">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                FaithIQ Admin
              </h1>
              <p className="text-xs text-gray-500">Bible Trivia Management</p>
            </div>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-2">
            <button
              onClick={() => setActiveTab("questions")}
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
              onClick={() => setActiveTab("stats")}
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
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeTab === "settings"
                  ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Settings size={20} />
              <span className="font-medium">Settings</span>
            </button>
            
            <button
              onClick={() => setActiveTab("voices")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeTab === "voices"
                  ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Mic size={20} />
              <span className="font-medium">Voice Management</span>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer - Fixed at bottom */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <Link href="/">
            <Button variant="outline" className="w-full flex items-center gap-2 hover:bg-gray-50 transition-colors">
              <Home size={18} /> Return to Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col h-screen">
        {/* Top Navbar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {activeTab === "questions" && "Question Management"}
                    {activeTab === "stats" && "Game Statistics"}
                    {activeTab === "settings" && "Settings"}
                    {activeTab === "voices" && "Voice Management"}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {activeTab === "questions" && "Manage your Bible trivia questions and content"}
                    {activeTab === "stats" && "View game analytics and performance metrics"}
                    {activeTab === "settings" && "Configure game parameters and behavior"}
                    {activeTab === "voices" && "Manage voice settings and AI voice cloning"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                FaithIQ Admin
              </div>
              <div className="h-6 w-px bg-gray-300"></div>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Settings size={16} />
                Quick Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {/* Content Container */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Questions Tab Content */}
            {activeTab === "questions" && (
              <div className="flex flex-col h-full">
                {/* Fixed Filters Section */}
                <div className="bg-gray-50 rounded-xl p-6 mb-6 flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Filter Questions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

                    <Button 
                      onClick={() => refetch()} 
                      variant="outline"
                      className="flex items-center gap-2 bg-white border-gray-200 hover:bg-gray-50"
                    >
                      <RefreshCw size={16} /> Refresh
                    </Button>
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
                    onClick={() => setShowVoiceCloneDialog(true)}
                    variant="outline" 
                    className="flex items-center gap-2 border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 bg-gradient-to-r from-orange-50 to-amber-50"
                  >
                    <Mic size={18} className="text-orange-600" />
                    <span className="text-orange-700 font-medium">
                      {voiceStatus?.hasVoiceClone ? 'Update Voice Clone' : 'Upload Voice Clone'}
                    </span>
                    {voiceStatus?.hasVoiceClone && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full animate-pulse">
                        Active: {voiceStatus.name || 'Your Voice'}
                      </span>
                    )}
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
                  >
                    <Download size={18} /> Export Questions
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
                    </div>
                  ) : filteredQuestions.length === 0 ? (
                    <div className="text-center p-12 flex-1">
                      <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 font-medium">No questions found</p>
                      <p className="text-gray-500 mt-2">Add some questions or adjust your filters</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto">
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

            {/* Stats Tab Content */}
            {activeTab === "stats" && (
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-blue-600 font-medium">Total Games</p>
                          <p className="text-3xl font-bold text-blue-800">24</p>
                          <p className="text-xs text-blue-600 mt-1">+12% from last week</p>
                        </div>
                        <div className="h-12 w-12 bg-blue-500 rounded-xl flex items-center justify-center">
                          <FileText className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-600 font-medium">Avg. Score</p>
                          <p className="text-3xl font-bold text-green-800">7.2</p>
                          <p className="text-xs text-green-600 mt-1">+0.8 from last week</p>
                        </div>
                        <div className="h-12 w-12 bg-green-500 rounded-xl flex items-center justify-center">
                          <CheckCircle className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-purple-100">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-purple-600 font-medium">Rewards Claimed</p>
                          <p className="text-3xl font-bold text-purple-800">12</p>
                          <p className="text-xs text-purple-600 mt-1">+3 from last week</p>
                        </div>
                        <div className="h-12 w-12 bg-purple-500 rounded-xl flex items-center justify-center">
                          <Trophy className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-8">
                    <div className="text-center">
                      <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 font-medium">Detailed Statistics</p>
                      <p className="text-gray-500 mt-2">Comprehensive analytics and insights will be available soon</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Settings Tab Content */}
            {activeTab === "settings" && (
              <div className="p-8">
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">Game Settings</CardTitle>
                    <CardDescription>
                      Configure game parameters and behavior
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Time per Question (seconds)</label>
                        <Input 
                          type="number" 
                          defaultValue="20" 
                          min="5" 
                          max="60" 
                          className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Time-based Game Duration (minutes)</label>
                        <Input 
                          type="number" 
                          defaultValue="15" 
                          min="5" 
                          max="30" 
                          className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Questions per Game</label>
                        <Input 
                          type="number" 
                          defaultValue="10" 
                          min="5" 
                          max="20" 
                          className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Max Players per Game</label>
                        <Input 
                          type="number" 
                          defaultValue="4" 
                          min="2" 
                          max="8" 
                          className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    
                    <Button disabled className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                      Save Settings
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Voices Tab Content */}
            {activeTab === "voices" && (
              <div className="p-8">
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
