/** Client-side helpers for Home page — no backend changes */

export interface DailyVerse {
  reference: string;
  text: string;
}

export interface DailyChallengeConfig {
  title: string;
  description: string;
  category: string;
  difficulty: string;
  gameType: "question" | "time";
}

const DAILY_VERSES: DailyVerse[] = [
  {
    reference: "Philippians 4:13",
    text: "I can do all things through Christ who strengthens me.",
  },
  {
    reference: "Jeremiah 29:11",
    text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
  },
  {
    reference: "Proverbs 3:5-6",
    text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
  },
  {
    reference: "Psalm 23:1",
    text: "The Lord is my shepherd; I shall not want.",
  },
  {
    reference: "Joshua 1:9",
    text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
  },
  {
    reference: "Romans 8:28",
    text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.",
  },
  {
    reference: "Isaiah 40:31",
    text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles.",
  },
];

const DAILY_CHALLENGES: DailyChallengeConfig[] = [
  {
    title: "Stories of Faith",
    description: "Answer 10 Bible Stories questions at Beginner level.",
    category: "Bible Stories",
    difficulty: "Beginner",
    gameType: "question",
  },
  {
    title: "Old Testament Sprint",
    description: "Test your knowledge of the Old Testament.",
    category: "Old Testament",
    difficulty: "Intermediate",
    gameType: "question",
  },
  {
    title: "Speed Round",
    description: "How many questions can you answer before time runs out?",
    category: "All Categories",
    difficulty: "Beginner",
    gameType: "time",
  },
  {
    title: "Famous Faces",
    description: "Identify key people from Scripture.",
    category: "Famous People",
    difficulty: "Intermediate",
    gameType: "question",
  },
  {
    title: "New Testament Focus",
    description: "Dive into the Gospels and early church.",
    category: "New Testament",
    difficulty: "Beginner",
    gameType: "question",
  },
  {
    title: "Theme Explorer",
    description: "Themed questions across Scripture.",
    category: "Theme-Based",
    difficulty: "Advanced",
    gameType: "question",
  },
  {
    title: "Mixed Mastery",
    description: "All categories — advanced difficulty.",
    category: "All Categories",
    difficulty: "Advanced",
    gameType: "question",
  },
];

function dayIndex(): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = Date.now() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getDailyVerse(): DailyVerse {
  return DAILY_VERSES[dayIndex() % DAILY_VERSES.length];
}

export function getDailyChallenge(): DailyChallengeConfig {
  return DAILY_CHALLENGES[dayIndex() % DAILY_CHALLENGES.length];
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export interface UnfinishedGame {
  gameId: string;
  currentQuestionIndex: number;
  score: number;
  correctAnswers: number;
  label: string;
}

export function getUnfinishedGame(): UnfinishedGame | null {
  try {
    const gameId = sessionStorage.getItem("currentGameId");
    if (!gameId) return null;

    const raw = sessionStorage.getItem(`gameState_${gameId}`);
    if (!raw) return null;

    const state = JSON.parse(raw);
    if (state.gameEnded) return null;
    if (state.currentQuestionIndex === 0 && (state.score ?? 0) === 0) {
      return null;
    }

    const qNum = (state.currentQuestionIndex ?? 0) + 1;
    return {
      gameId,
      currentQuestionIndex: state.currentQuestionIndex ?? 0,
      score: state.score ?? 0,
      correctAnswers: state.correctAnswers ?? 0,
      label: `Question ${qNum} · Score ${state.score ?? 0}`,
    };
  } catch {
    return null;
  }
}
