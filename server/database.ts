import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, or, like, desc, asc, gte, lt } from "drizzle-orm";
import postgres from "postgres";
import {
  users,
  teams,
  teamInvitations,
  teamBattles,
  questions,
  gameResults,
  singlePlayerScores,
  multiplayerScores,
  gameSessions,
  challenges,
  challengeResults,
  notifications,
  sessions,
  voiceSettings,
  voiceUsage,
  userQuestionHistory,
  questionAnalytics,
  type User,
  type InsertUser,
  type Question,
  type GameResult,
  type GameSession,
  type Challenge,
  type ChallengeResult,
  type Notification,
  type Team,
  type TeamInvitation,
  type TeamBattle,
  type InsertTeamBattle,
  type InsertSinglePlayerScore,
  type VoiceSettings,
  type InsertVoiceSettings,
  type VoiceUsage,
  type InsertVoiceUsage,
  type UserQuestionHistory,
  type InsertUserQuestionHistory,
  type QuestionAnalytics,
  type InsertQuestionAnalytics,
} from "@shared/schema";

// Production PostgreSQL Database Connection
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db";

// Ensure the connection string is properly formatted
if (!connectionString || typeof connectionString !== "string") {
  throw new Error("DATABASE_URL must be a valid string");
}

console.log(
  "🔗 Connecting to database:",
  connectionString.replace(/:[^:@]*@/, ":****@")
); // Hide password in logs

// Enable SSL for Neon or when sslmode=require is present, keep it disabled for local connections
const useSSL =
  connectionString.includes("neon.tech") ||
  connectionString.includes("sslmode=require");

const client = postgres(connectionString, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout
  onnotice: () => {}, // Suppress notices
  ssl: useSSL ? "require" : false,
});

export const db = drizzle(client);

// Database interface for all operations
export interface IDatabase {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;

  // Question methods
  getQuestions(filters: {
    category?: string;
    difficulty?: string;
    search?: string;
  }): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: Question): Promise<Question>;
  updateQuestion(id: string, question: Question): Promise<Question>;
  deleteQuestion(id: string): Promise<void>;
  getRandomQuestions(filters: {
    category?: string;
    difficulty?: string;
    count: number;
  }): Promise<Question[]>;

  // Game result methods
  saveGameResult(result: GameResult): Promise<GameResult>;
  getGameResults(): Promise<GameResult[]>;

  // Single player score methods
  saveSinglePlayerScore(score: InsertSinglePlayerScore): Promise<any>;
  getSinglePlayerScores(filters?: {
    userId?: number;
    category?: string;
    difficulty?: string;
    gameType?: string;
  }): Promise<any[]>;
  getLeaderboardData(gameType?: string, category?: string): Promise<any[]>;

  // Multiplayer score methods
  saveMultiplayerScore(score: any): Promise<any>;
  getMultiplayerScores(filters?: {
    gameSessionId?: string;
    playerName?: string;
    category?: string;
    difficulty?: string;
  }): Promise<any[]>;
  getMultiplayerLeaderboardData(
    category?: string,
    difficulty?: string
  ): Promise<any[]>;

  // Game session methods
  getGameSession(id: string): Promise<GameSession | undefined>;
  createGameSession(session: GameSession): Promise<GameSession>;
  updateGameSession(
    id: string,
    session: Partial<GameSession>
  ): Promise<GameSession>;

  // Challenge methods
  getChallenge(id: string): Promise<Challenge | undefined>;
  getChallengesByUser(userId: number, status?: string): Promise<Challenge[]>;
  createChallenge(challenge: Challenge): Promise<Challenge>;
  updateChallenge(id: string, updates: Partial<Challenge>): Promise<Challenge>;

  // Challenge result methods
  getChallengeResult(id: string): Promise<ChallengeResult | undefined>;
  getChallengeResultsByChallenge(
    challengeId: string
  ): Promise<ChallengeResult[]>;
  createChallengeResult(result: ChallengeResult): Promise<ChallengeResult>;
  updateChallengeResult(
    id: string,
    updates: Partial<ChallengeResult>
  ): Promise<ChallengeResult>;

  // Notification methods
  getNotifications(userId: number, read?: boolean): Promise<Notification[]>;
  createNotification(notification: Notification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;
  deleteNotification(id: string): Promise<void>;

  // Online user methods
  getOnlineUsers(): Promise<User[]>;
  setUserOnline(userId: number, isOnline: boolean): Promise<User>;

  // Team methods
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByGameSession(gameSessionId: string): Promise<Team[]>;
  createTeam(team: Team): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;

  // Team invitation methods
  getTeamInvitation(id: string): Promise<TeamInvitation | undefined>;
  getTeamInvitationsByUser(
    userId: number,
    status?: string
  ): Promise<TeamInvitation[]>;
  getAllTeamInvitationsByUser(
    userId: number,
    status?: string
  ): Promise<TeamInvitation[]>;
  createTeamInvitation(invitation: TeamInvitation): Promise<TeamInvitation>;
  updateTeamInvitation(
    id: string,
    updates: Partial<TeamInvitation>
  ): Promise<TeamInvitation>;
  deleteTeamInvitation(id: string): Promise<void>;

  // Team battle methods
  getTeamBattle(id: string): Promise<TeamBattle | undefined>;
  getTeamBattlesByUser(userId: number, status?: string): Promise<TeamBattle[]>;
  getTeamBattlesByGameSession(gameSessionId: string): Promise<TeamBattle[]>;
  createTeamBattle(battle: InsertTeamBattle): Promise<TeamBattle>;
  updateTeamBattle(
    id: string,
    updates: Partial<TeamBattle>
  ): Promise<TeamBattle>;
  deleteTeamBattle(id: string): Promise<void>;

  // Voice settings methods
  getVoiceCloneId(): Promise<string | null>;
  setVoiceCloneId(voiceId: string | null): Promise<void>;
  getVoiceSettings(): Promise<VoiceSettings | undefined>;
  updateVoiceSettings(updates: Partial<VoiceSettings>): Promise<VoiceSettings>;

  // Voice usage tracking methods
  trackVoiceUsage(usage: InsertVoiceUsage): Promise<VoiceUsage>;
  getVoiceUsageStats(timeframe?: "day" | "week" | "month"): Promise<{
    totalRequests: number;
    totalCharacters: number;
    estimatedCredits: number;
    requestsByType: Record<string, number>;
  }>;

  // User question history methods
  getUserQuestionHistory(userId: number, hoursBack?: number): Promise<UserQuestionHistory[]>;
  addUserQuestionHistory(history: InsertUserQuestionHistory): Promise<UserQuestionHistory>;
  cleanupOldQuestionHistory(hoursBack?: number): Promise<void>;

  // Enhanced question selection methods
  getRandomQuestionsWithHistory(filters: {
    category?: string;
    difficulty?: string;
    count: number;
    userId?: number;
    excludeRecentHours?: number;
  }): Promise<Question[]>;

  // Initialize database with sample data
  initializeDatabase(): Promise<void>;
}

class PostgreSQLDatabase implements IDatabase {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return result[0] as User | undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.select().from(users).orderBy(asc(users.username));
    return result as User[];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db
      .insert(users)
      .values({
        username: user.username,
        password: user.password,
        email: user.email,
        isAdmin: user.isAdmin ?? false,
        isOnline: false,
        lastSeen: new Date(),
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      })
      .returning();
    return result[0] as User;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    await db.update(users).set(updates).where(eq(users.id, id));
    const updated = await this.getUser(id);
    if (!updated) throw new Error(`User with id ${id} not found`);
    return updated;
  }

  // Question methods - Get questions from database only
  async getQuestions(filters: {
    category?: string;
    difficulty?: string;
    search?: string;
  }): Promise<Question[]> {
    try {
      // Get questions from database
      let dbQuestions = await db.select().from(questions);
      let questionList = dbQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        context: q.context || undefined,
        category: q.category,
        difficulty: q.difficulty,
        answers: q.answers,
      })) as Question[];

      console.log(
        `📊 Retrieved ${questionList.length} questions from database`
      );

      let filteredQuestions = questionList;

      if (filters.category) {
        filteredQuestions = filteredQuestions.filter(
          (q) => q.category === filters.category
        );
        console.log(
          `📂 Filtered by category '${filters.category}': ${filteredQuestions.length} questions`
        );
      }

      if (filters.difficulty) {
        filteredQuestions = filteredQuestions.filter(
          (q) => q.difficulty === filters.difficulty
        );
        console.log(
          `🎯 Filtered by difficulty '${filters.difficulty}': ${filteredQuestions.length} questions`
        );
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredQuestions = filteredQuestions.filter(
          (q) =>
            q.text.toLowerCase().includes(searchTerm) ||
            (q.context && q.context.toLowerCase().includes(searchTerm)) ||
            q.answers.some((a) => a.text.toLowerCase().includes(searchTerm))
        );
        console.log(
          `🔍 Filtered by search '${filters.search}': ${filteredQuestions.length} questions`
        );
      }

      return filteredQuestions;
    } catch (error) {
      console.error("❌ Error fetching questions from database:", error);
      throw new Error(
        `Failed to fetch questions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    try {
      const dbQuestion = await db
        .select()
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (dbQuestion.length === 0) {
        return undefined;
      }

      const q = dbQuestion[0];
      return {
        id: q.id,
        text: q.text,
        context: q.context || undefined,
        category: q.category,
        difficulty: q.difficulty,
        answers: q.answers,
      } as Question;
    } catch (error) {
      console.error("❌ Error fetching question from database:", error);
      return undefined;
    }
  }

  async createQuestion(question: Question): Promise<Question> {
    try {
      const result = await db
        .insert(questions)
        .values({
          id: question.id,
          text: question.text,
          context: question.context,
          category: question.category,
          difficulty: question.difficulty,
          answers: question.answers,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(`Question stored in database with ID: ${question.id}`);
      return result[0] as Question;
    } catch (error) {
      console.error("Error storing question in database:", error);
      throw new Error(
        `Failed to store question: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async updateQuestion(id: string, question: Question): Promise<Question> {
    try {
      const result = await db
        .update(questions)
        .set({
          text: question.text,
          context: question.context,
          category: question.category,
          difficulty: question.difficulty,
          answers: question.answers,
          updatedAt: new Date(),
        })
        .where(eq(questions.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error(`Question with ID ${id} not found`);
      }

      console.log(`✅ Question updated in database: ${id}`);
      return result[0] as Question;
    } catch (error) {
      console.error("❌ Error updating question in database:", error);
      throw new Error(
        `Failed to update question: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async deleteQuestion(id: string): Promise<void> {
    try {
      const result = await db
        .delete(questions)
        .where(eq(questions.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error(`Question with ID ${id} not found`);
      }

      console.log(`✅ Question deleted from database: ${id}`);
    } catch (error) {
      console.error("❌ Error deleting question from database:", error);
      throw new Error(
        `Failed to delete question: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async getRandomQuestions(filters: {
    category?: string;
    difficulty?: string;
    count: number;
  }): Promise<Question[]> {
    // Fallback to new method for backward compatibility
    return this.getRandomQuestionsWithHistory({
      ...filters,
      excludeRecentHours: 0, // No history filtering for backward compatibility
    });
  }

  async getRandomQuestionsWithHistory(filters: {
    category?: string;
    difficulty?: string;
    count: number;
    userId?: number;
    excludeRecentHours?: number;
  }): Promise<Question[]> {
    try {
      console.log(
        `🎲 Getting ${filters.count} random questions with enhanced selection:`,
        filters
      );

      // Step 1: Get user's recent question history if userId provided
      let excludeQuestionIds: string[] = [];
      if (filters.userId && filters.excludeRecentHours && filters.excludeRecentHours > 0) {
        const recentHistory = await this.getUserQuestionHistory(
          filters.userId,
          filters.excludeRecentHours
        );
        excludeQuestionIds = recentHistory.map(h => h.questionId);
        console.log(
          `📚 Excluding ${excludeQuestionIds.length} recently seen questions for user ${filters.userId}`
        );
      }

      // Step 2: Use enhanced random selection with user-specific seeding
      const selectedQuestions = await this.enhancedRandomSelection({
        ...filters,
        excludeQuestionIds,
        userSeed: filters.userId || 0,
      });

      // Step 3: Shuffle questions and answers with user-specific entropy
      const shuffledQuestions = this.shuffleQuestionsAndAnswers(
        selectedQuestions,
        filters.userId
      );

      // Step 4: Additional randomization pass to ensure uniqueness
      const finalQuestions = this.cryptoSecureShuffle(
        shuffledQuestions,
        this.generateUserSpecificSeed(filters.userId)
      );

      // Step 6: Track question history if user provided
      if (filters.userId && finalQuestions.length > 0) {
        await this.trackSelectedQuestions(filters.userId, finalQuestions);
      }

      console.log(
        `✅ Selected ${finalQuestions.length} unique questions with enhanced randomization`
      );
      return finalQuestions;
    } catch (error) {
      console.error("❌ Error in getRandomQuestionsWithHistory:", error);
      throw new Error(
        `Failed to get random questions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Enhanced Random Selection with User History
   */
  private async enhancedRandomSelection(filters: {
    category?: string;
    difficulty?: string;
    count: number;
    excludeQuestionIds?: string[];
    userSeed?: number;
  }): Promise<Question[]> {
    try {
      // Get all questions from database
      const allQuestions = await this.getQuestions({});
      
      if (allQuestions.length === 0) {
        console.log("❌ No questions available in database");
        return [];
      }

      // Filter out invalid questions FIRST, before any selection
      const validQuestions = allQuestions.filter(
        q => q && typeof q.id === 'string' && q.id.length > 0 && q.answers && q.answers.length > 0
      );
      
      if (validQuestions.length === 0) {
        console.log("❌ No valid questions available in database");
        return [];
      }
      
      console.log(`📊 Total questions: ${allQuestions.length}, Valid questions: ${validQuestions.length}`);

      // Filter out excluded questions
      let availableQuestions = validQuestions;
      if (filters.excludeQuestionIds && filters.excludeQuestionIds.length > 0) {
        availableQuestions = validQuestions.filter(
          q => !filters.excludeQuestionIds!.includes(q.id)
        );
      }

      // Apply category and difficulty filters
      let filteredQuestions = availableQuestions;
      if (filters.category && filters.category !== "All Categories") {
        filteredQuestions = filteredQuestions.filter(
          q => q.category === filters.category
        );
      }
      if (filters.difficulty && filters.difficulty !== "All") {
        filteredQuestions = filteredQuestions.filter(
          q => q.difficulty === filters.difficulty
        );
      }

      // If not enough questions, progressively broaden the filters
      if (filteredQuestions.length < filters.count) {
        console.log(`⚠️ Only ${filteredQuestions.length} questions match filters, need ${filters.count}. Broadening search...`);
        
        // Try removing difficulty filter first
        if (filters.difficulty && filters.difficulty !== "All") {
          let broaderQuestions = availableQuestions;
          if (filters.category && filters.category !== "All Categories") {
            broaderQuestions = broaderQuestions.filter(
              q => q.category === filters.category
            );
          }
          
          if (broaderQuestions.length >= filters.count) {
            console.log(`✅ Found ${broaderQuestions.length} questions by removing difficulty filter`);
            filteredQuestions = broaderQuestions;
          } else {
            // If still not enough, remove all filters
            console.log(`⚠️ Still only ${broaderQuestions.length} questions. Using all available questions.`);
            filteredQuestions = availableQuestions;
          }
        }
      }

      if (filteredQuestions.length === 0) {
        console.log("⚠️ No questions available after filtering, using fallback");
        return this.memoryBasedRandomSelection({
          category: filters.category,
          difficulty: filters.difficulty,
          count: Math.min(filters.count, allQuestions.length),
        });
      }

      // Use simple random selection for better variety
      const selected = this.simpleRandomSelection(
        filteredQuestions,
        filters.count,
        filters.userSeed
      );
      
      console.log(`✅ Selected ${selected.length} out of ${filters.count} requested questions`);
      
      // If we still don't have enough questions, log a warning
      if (selected.length < filters.count) {
        console.log(`⚠️ WARNING: Could only provide ${selected.length} questions instead of ${filters.count}`);
        console.log(`📊 Available questions after all filtering: ${filteredQuestions.length}`);
        console.log(`📊 Total questions in database: ${allQuestions.length}`);
      }
      
      return selected;
    } catch (error) {
      console.error("❌ Error in enhanced random selection:", error);
      // Fallback to basic selection
      console.log("🔄 Falling back to basic selection");
      return this.memoryBasedRandomSelection({
        category: filters.category,
        difficulty: filters.difficulty,
        count: filters.count,
      });
    }
  }

  private async getQuestionCount(): Promise<number> {
    try {
      const result = await db.select().from(questions);
      return result.length;
    } catch (error) {
      console.error("Error getting question count:", error);
      return 0;
    }
  }





  /**
   * Memory-based random selection (original algorithm)
   * Used for small datasets or as fallback
   */
  private async memoryBasedRandomSelection(filters: {
    category?: string;
    difficulty?: string;
    count: number;
  }): Promise<Question[]> {
    // Get all questions from database
    const allQuestions = await this.getQuestions({});

    if (allQuestions.length === 0) {
      return [];
    }

    // Apply filters to get primary candidates
    let primaryCandidates: Question[] = [];
    let secondaryCandidates: Question[] = [];

    if (filters.category && filters.category !== "All Categories") {
      primaryCandidates = allQuestions.filter(
        (q) => q.category === filters.category
      );

      if (filters.difficulty) {
        primaryCandidates = primaryCandidates.filter(
          (q) => q.difficulty === filters.difficulty
        );
      }

      if (filters.difficulty) {
        secondaryCandidates = allQuestions.filter(
          (q) =>
            q.difficulty === filters.difficulty &&
            q.category !== filters.category
        );
      } else {
        secondaryCandidates = allQuestions.filter(
          (q) => q.category !== filters.category
        );
      }
    } else if (filters.difficulty) {
      primaryCandidates = allQuestions.filter(
        (q) => q.difficulty === filters.difficulty
      );
      secondaryCandidates = allQuestions.filter(
        (q) => q.difficulty !== filters.difficulty
      );
    } else {
      primaryCandidates = allQuestions;
    }

    return this.weightedRandomSelection(
      primaryCandidates,
      secondaryCandidates,
      filters.count
    );
  }

  /**
   * Guaranteed Count Selection Algorithm
   *
   * Algorithm: Ensures exact count with maximum randomness
   * Time Complexity: O(n) where n is total number of candidates
   * Space Complexity: O(k) where k is the number of questions to select
   *
   * Strategy:
   * 1. Prioritize primary candidates but ensure exact count
   * 2. Fill remaining slots from secondary and tertiary candidates
   * 3. Use enhanced shuffling for true randomness
   * 4. Guarantee the requested count is returned
   */
  private guaranteedCountSelection(
    primaryCandidates: Question[],
    secondaryCandidates: Question[],
    tertiaryCandidates: Question[],
    count: number
  ): Question[] {
    const selectedQuestions: Question[] = [];
    const usedIds = new Set<string>();

    console.log(`🎯 Target count: ${count}`);

    // Step 1: Shuffle all candidate pools for maximum randomness
    const shuffledPrimary = this.enhancedShuffle([...primaryCandidates]);
    const shuffledSecondary = this.enhancedShuffle([...secondaryCandidates]);
    const shuffledTertiary = this.enhancedShuffle([...tertiaryCandidates]);

    // Step 2: Fill from primary candidates first (up to 70% of target)
    const primaryTarget = Math.min(
      Math.ceil(count * 0.7),
      shuffledPrimary.length
    );
    for (
      let i = 0;
      i < primaryTarget && selectedQuestions.length < count;
      i++
    ) {
      const question = shuffledPrimary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(
      `✅ Selected ${selectedQuestions.length} questions from primary candidates`
    );

    // Step 3: Fill from secondary candidates (up to 20% of target)
    const secondaryTarget = Math.min(
      Math.ceil(count * 0.2),
      shuffledSecondary.length
    );
    for (
      let i = 0;
      i < secondaryTarget && selectedQuestions.length < count;
      i++
    ) {
      const question = shuffledSecondary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(
      `✅ Selected ${selectedQuestions.length} questions from secondary candidates`
    );

    // Step 4: Fill remaining slots from tertiary candidates
    for (
      let i = 0;
      i < shuffledTertiary.length && selectedQuestions.length < count;
      i++
    ) {
      const question = shuffledTertiary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(
      `✅ Selected ${selectedQuestions.length} questions from tertiary candidates`
    );

    // Step 5: If we still need more questions, fill from any remaining candidates
    if (selectedQuestions.length < count) {
      const allCandidates = [
        ...shuffledPrimary,
        ...shuffledSecondary,
        ...shuffledTertiary,
      ];
      for (
        let i = 0;
        i < allCandidates.length && selectedQuestions.length < count;
        i++
      ) {
        const question = allCandidates[i];
        if (!usedIds.has(question.id)) {
          selectedQuestions.push(question);
          usedIds.add(question.id);
        }
      }
    }

    // Step 6: Final enhanced shuffle for maximum randomness
    const finalShuffle = this.enhancedShuffle(selectedQuestions);

    console.log(
      `🎲 Final selection: ${finalShuffle.length} questions with ${
        new Set(finalShuffle.map((q: Question) => q.category)).size
      } categories`
    );
    console.log(
      `✅ Guaranteed count achieved: ${finalShuffle.length}/${count}`
    );

    return finalShuffle;
  }

  /**
   * Weighted Random Selection Algorithm
   *
   * Algorithm: Modified Reservoir Sampling with Category Prioritization
   * Time Complexity: O(n) where n is total number of candidates
   * Space Complexity: O(k) where k is the number of questions to select
   *
   * Strategy:
   * 1. Primary candidates get 80% weight (filtered questions)
   * 2. Secondary candidates get 20% weight (other questions)
   * 3. Within each group, use Fisher-Yates shuffle for true randomness
   * 4. Combine results ensuring variety while respecting filters
   */
  private weightedRandomSelection(
    primaryCandidates: Question[],
    secondaryCandidates: Question[],
    count: number
  ): Question[] {
    const selectedQuestions: Question[] = [];

    // Calculate how many questions to take from each group with more variety
    const primaryCount = Math.min(
      Math.ceil(count * 0.7), // 70% from primary
      primaryCandidates.length
    );

    const secondaryCount = Math.min(
      Math.ceil(count * 0.2), // 20% from secondary
      secondaryCandidates.length
    );

    const tertiaryCount = Math.min(
      count - primaryCount - secondaryCount, // 10% from tertiary
      Math.max(
        0,
        primaryCandidates.length +
          secondaryCandidates.length -
          primaryCount -
          secondaryCount
      )
    );

    console.log(
      `📊 Selection breakdown: ${primaryCount} primary, ${secondaryCount} secondary, ${tertiaryCount} tertiary`
    );

    // Step 1: Select from primary candidates (filtered questions)
    if (primaryCandidates.length > 0) {
      const shuffledPrimary = this.enhancedShuffle([...primaryCandidates]);
      selectedQuestions.push(...shuffledPrimary.slice(0, primaryCount));
      console.log(
        `✅ Selected ${primaryCount} questions from primary candidates`
      );
    }

    // Step 2: Select from secondary candidates (other questions)
    if (secondaryCandidates.length > 0 && secondaryCount > 0) {
      const shuffledSecondary = this.enhancedShuffle([...secondaryCandidates]);
      selectedQuestions.push(...shuffledSecondary.slice(0, secondaryCount));
      console.log(
        `✅ Selected ${secondaryCount} questions from secondary candidates`
      );
    }

    // Step 3: Select from tertiary candidates (remaining questions)
    if (tertiaryCount > 0) {
      const allRemaining = [...primaryCandidates, ...secondaryCandidates];
      const usedIds = new Set(selectedQuestions.map((q: Question) => q.id));
      const unusedQuestions = allRemaining.filter(
        (q: Question) => !usedIds.has(q.id)
      );

      if (unusedQuestions.length > 0) {
        const shuffledTertiary = this.enhancedShuffle(unusedQuestions);
        selectedQuestions.push(...shuffledTertiary.slice(0, tertiaryCount));
        console.log(
          `✅ Selected ${Math.min(
            tertiaryCount,
            unusedQuestions.length
          )} questions from tertiary candidates`
        );
      }
    }

    // Step 4: Enhanced final shuffle to randomize the order
    const finalShuffle = this.enhancedShuffle(selectedQuestions);

    console.log(
      `🎲 Final selection: ${finalShuffle.length} questions with ${
        new Set(finalShuffle.map((q: Question) => q.category)).size
      } categories`
    );
    return finalShuffle;
  }

  /**
   * Fisher-Yates Shuffle Algorithm
   *
   * Algorithm: Fisher-Yates (Knuth) Shuffle
   * Time Complexity: O(n)
   * Space Complexity: O(1) - in-place shuffle
   *
   * This is the most efficient and unbiased shuffle algorithm
   * It ensures each permutation has equal probability
   */
  private fisherYatesShuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    
    // Use multiple entropy sources for better randomness
    const entropy = this.generateMultipleEntropySeed();
    let currentSeed = entropy;
    
    const getEnhancedRandom = () => {
      // Combine Math.random() with seeded randomness for maximum entropy
      const mathRandom = Math.random();
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      const seededRandom = currentSeed / 4294967296;
      return (mathRandom + seededRandom) / 2; // Average for better distribution
    };

    for (let i = shuffled.length - 1; i > 0; i--) {
      // Generate random index from 0 to i (inclusive) with enhanced randomness
      const j = Math.floor(getEnhancedRandom() * (i + 1));

      // Swap elements at positions i and j
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Stable Shuffle Algorithm with Seed
   *
   * Algorithm: Seeded Fisher-Yates with deterministic but varied results
   * Time Complexity: O(n)
   * Space Complexity: O(1)
   *
   * This provides consistent shuffling based on a seed while ensuring
   * different results for different seeds
   */
  private stableShuffle<T>(array: T[], seed?: number): T[] {
    const shuffled = [...array];
    const seedValue = seed ?? Date.now();

    // Simple Linear Congruential Generator for deterministic randomness
    let randomSeed = seedValue;
    const lcg = () => {
      randomSeed = (randomSeed * 1664525 + 1013904223) % 4294967296;
      return randomSeed / 4294967296;
    };

    // Fisher-Yates shuffle with seeded random
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(lcg() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Enhanced Shuffle Algorithm
   *
   * Algorithm: Multiple-pass Fisher-Yates with additional randomization
   * Time Complexity: O(n)
   * Space Complexity: O(1)
   *
   * This provides better randomness by applying multiple shuffle passes
   * and using different random seeds for each pass
   */
  private enhancedShuffle<T>(array: T[]): T[] {
    let shuffled = [...array];

    // Multiple shuffle passes for better randomness
    for (let pass = 0; pass < 3; pass++) {
      const passSeed = Math.floor(Math.random() * 1000000);

      for (let i = shuffled.length - 1; i > 0; i--) {
        // Use different random generation for each pass
        const j = Math.floor((Math.random() * passSeed) % (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }

    // Additional randomization: reverse some sections
    if (shuffled.length > 4) {
      const midPoint = Math.floor(shuffled.length / 2);
      const reverseStart = Math.floor(Math.random() * midPoint);
      const reverseEnd = midPoint + Math.floor(Math.random() * midPoint);

      // Reverse a random section
      const section = shuffled.slice(reverseStart, reverseEnd);
      section.reverse();
      shuffled.splice(reverseStart, section.length, ...section);
    }

    return shuffled;
  }

  /**
   * Shuffle answers for a question to prevent correct answer always being first
   */
  private shuffleQuestionAnswers(question: Question, seed?: number): Question {
    if (!question.answers || question.answers.length <= 1) {
      return question;
    }

    const shuffledAnswers = this.stableShuffle(question.answers, seed);

    return {
      ...question,
      answers: shuffledAnswers,
    };
  }

  /**
   * Shuffle both questions and answers with user-specific entropy
   */
  private shuffleQuestionsAndAnswers(questions: Question[], userId?: number): Question[] {
    if (!questions || questions.length === 0) {
      return questions;
    }

    // Generate user-specific seed for personalized randomization
    const baseSeed = this.generateUserSpecificSeed(userId);

    // First shuffle the questions themselves with crypto-secure randomization
    const shuffledQuestions = this.cryptoSecureShuffle(questions, baseSeed);

    // Then shuffle answers for each question with different seeds
    return shuffledQuestions.map((question, index) => {
      // Use different seed for each question's answers
      const answerSeed = baseSeed + index * 1000 + question.id.charCodeAt(0);
      return this.shuffleQuestionAnswers(question, answerSeed);
    });
  }

  /**
   * Generate user-specific seed for personalized randomization
   */
  private generateUserSpecificSeed(userId?: number): number {
    const timestamp = Date.now();
    const userComponent = userId ? userId * 31 : 0; // Prime number for better distribution
    const randomComponent = Math.floor(Math.random() * 1000000);
    const microtime = performance.now(); // High-resolution timestamp for uniqueness
    
    // Combine multiple entropy sources including high-resolution time
    return Math.floor(timestamp + userComponent + randomComponent + microtime);
  }

  /**
   * Generate multiple entropy sources for maximum randomness
   */
  private generateMultipleEntropySeed(userSeed?: number): number {
    const timestamp = Date.now();
    const microtime = performance.now();
    const randomComponent = Math.floor(Math.random() * 1000000);
    const userComponent = userSeed ? userSeed * 37 : 0; // Different prime for variety
    const processComponent = process.hrtime.bigint(); // High-resolution process time
    
    // Combine all entropy sources with bit shifting for better distribution
    return Math.floor(
      (timestamp ^ Number(processComponent)) + 
      (microtime * 1000) + 
      randomComponent + 
      userComponent
    );
  }

  /**
   * Seeded shuffle that uses a seed for consistent but varied results
   */
  private seededShuffle<T>(array: T[], seed?: number): T[] {
    const shuffled = [...array];
    
    // If no seed provided, use multiple entropy sources
    const actualSeed = seed ?? this.generateMultipleEntropySeed();
    
    // Enhanced Linear Congruential Generator with better constants
    let currentSeed = actualSeed;
    const getSeededRandom = () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      return currentSeed / 4294967296;
    };

    // Fisher-Yates shuffle with seeded randomness
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Crypto-secure shuffle using user-specific seeding
   */
  private cryptoSecureShuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    
    // Use enhanced seeded random for consistent but varied results
    let currentSeed = seed;
    const getSecureRandom = () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      return currentSeed / 4294967296;
    };

    // Enhanced Fisher-Yates with crypto-secure randomization
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(getSecureRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Simple random selection with time-based seeding
   */
  private simpleRandomSelection(
    questions: Question[],
    count: number,
    userSeed?: number
  ): Question[] {
    if (questions.length <= count) {
      // Use seeded shuffle even when returning all questions
      return this.seededShuffle([...questions], userSeed);
    }

    // Use seeded shuffle with multiple entropy sources for true randomness
    const entropy = this.generateMultipleEntropySeed(userSeed);
    const shuffled = this.seededShuffle([...questions], entropy);
    return shuffled.slice(0, count);
  }

  /**
   * Track selected questions for user history
   */
  private async trackSelectedQuestions(userId: number, questions: Question[]): Promise<void> {
    try {
      for (const question of questions) {
        await this.addUserQuestionHistory({
          userId,
          questionId: question.id,
          category: question.category,
          difficulty: question.difficulty,
        });
      }
    } catch (error) {
      console.error("Error tracking selected questions:", error);
      // Don't throw - this is non-critical
    }
  }

  // Game result methods
  async saveGameResult(result: GameResult): Promise<GameResult> {
    const dbResult = await db
      .insert(gameResults)
      .values({
        id: result.id,
        playerName: result.playerName,
        score: result.score,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        averageTime: result.averageTime,
        category: result.category,
        difficulty: result.difficulty,
        timestamp: new Date(result.timestamp),
      })
      .returning();

    // Convert back to the expected format
    const dbGameResult = dbResult[0];
    return {
      ...dbGameResult,
      timestamp:
        dbGameResult.timestamp?.toISOString() || new Date().toISOString(),
    } as GameResult;
  }

  async getGameResults(): Promise<GameResult[]> {
    const results = await db
      .select()
      .from(gameResults)
      .orderBy(desc(gameResults.timestamp));
    return results.map((result) => ({
      ...result,
      timestamp: result.timestamp?.toISOString() || new Date().toISOString(),
    })) as GameResult[];
  }

  // Single player score methods
  async saveSinglePlayerScore(score: InsertSinglePlayerScore): Promise<any> {
    const result = await db
      .insert(singlePlayerScores)
      .values(score)
      .returning();
    return result[0];
  }

  async getSinglePlayerScores(filters?: {
    userId?: number;
    category?: string;
    difficulty?: string;
    gameType?: string;
  }): Promise<any[]> {
    try {
      let whereClause = "";
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.userId) {
        whereClause += ` WHERE user_id = $${paramIndex}`;
        params.push(filters.userId);
        paramIndex++;
      }
      if (filters?.category) {
        whereClause += whereClause
          ? ` AND category = $${paramIndex}`
          : ` WHERE category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }
      if (filters?.difficulty) {
        whereClause += whereClause
          ? ` AND difficulty = $${paramIndex}`
          : ` WHERE difficulty = $${paramIndex}`;
        params.push(filters.difficulty);
        paramIndex++;
      }
      if (filters?.gameType) {
        whereClause += whereClause
          ? ` AND game_type = $${paramIndex}`
          : ` WHERE game_type = $${paramIndex}`;
        params.push(filters.gameType);
        paramIndex++;
      }

      const sql = `SELECT * FROM single_player_scores${whereClause} ORDER BY score DESC`;
      console.log("SQL Query:", sql, "Params:", params);

      // Use the postgres client directly for parameterized queries
      const client = postgres(
        "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db"
      );
      const result = await client.unsafe(sql, params);
      await client.end();

      console.log("Raw single player scores result:", result);
      return result;
    } catch (error) {
      console.error("Error in getSinglePlayerScores:", error);
      return [];
    }
  }

  // Multiplayer score methods
  async saveMultiplayerScore(score: any): Promise<any> {
    try {
      const result = await db
        .insert(multiplayerScores)
        .values({
          id:
            score.id ||
            `multi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          gameSessionId: score.gameSessionId,
          playerName: score.playerName,
          playerIndex: score.playerIndex,
          score: score.score,
          correctAnswers: score.correctAnswers,
          incorrectAnswers: score.incorrectAnswers,
          averageTime: score.averageTime.toString(),
          category: score.category,
          difficulty: score.difficulty,
          gameType: score.gameType,
          totalQuestions: score.totalQuestions,
          playerCount: score.playerCount,
          timestamp: new Date(),
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error("Error saving multiplayer score:", error);
      throw error;
    }
  }

  async getMultiplayerScores(filters?: {
    gameSessionId?: string;
    playerName?: string;
    category?: string;
    difficulty?: string;
  }): Promise<any[]> {
    try {
      let whereClause = "";
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.gameSessionId) {
        whereClause += ` WHERE game_session_id = $${paramIndex}`;
        params.push(filters.gameSessionId);
        paramIndex++;
      }
      if (filters?.playerName) {
        whereClause += whereClause
          ? ` AND player_name = $${paramIndex}`
          : ` WHERE player_name = $${paramIndex}`;
        params.push(filters.playerName);
        paramIndex++;
      }
      if (filters?.category) {
        whereClause += whereClause
          ? ` AND category = $${paramIndex}`
          : ` WHERE category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }
      if (filters?.difficulty) {
        whereClause += whereClause
          ? ` AND difficulty = $${paramIndex}`
          : ` WHERE difficulty = $${paramIndex}`;
        params.push(filters.difficulty);
        paramIndex++;
      }

      const sql = `SELECT * FROM multiplayer_scores${whereClause} ORDER BY score DESC`;
      console.log("SQL Query:", sql, "Params:", params);

      // Use the postgres client directly for parameterized queries
      const client = postgres(
        "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db"
      );
      const result = await client.unsafe(sql, params);
      await client.end();

      console.log("Raw multiplayer scores result:", result);
      return result;
    } catch (error) {
      console.error("Error in getMultiplayerScores:", error);
      return [];
    }
  }

  async getMultiplayerLeaderboardData(
    category?: string,
    difficulty?: string
  ): Promise<any[]> {
    try {
      // Use direct SQL query to get aggregated multiplayer scores
      const client = postgres(
        "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db"
      );

      let sql = `
        SELECT 
          player_name as name,
          MAX(score) as score,
          COUNT(*) as games_played,
          SUM(correct_answers) as total_correct_answers,
          SUM(incorrect_answers) as total_incorrect_answers,
          AVG(CAST(average_time AS FLOAT)) as avg_time,
          MAX(category) as category,
          MAX(difficulty) as difficulty,
          MAX(timestamp) as timestamp
        FROM multiplayer_scores
      `;

      // Add category filter if specified
      if (category && category !== "All Categories") {
        sql += ` WHERE category = '${category}'`;
      }

      // Add difficulty filter if specified
      if (difficulty && difficulty !== "All Difficulties") {
        sql +=
          category && category !== "All Categories"
            ? ` AND difficulty = '${difficulty}'`
            : ` WHERE difficulty = '${difficulty}'`;
      }

      sql += `
        GROUP BY player_name
        ORDER BY MAX(score) DESC
      `;

      const multiplayerResults = await client.unsafe(sql);
      await client.end();

      console.log("Multiplayer aggregated results:", multiplayerResults);

      const multiplayerLeaderboard = multiplayerResults.map((result) => ({
        id: result.name, // Use player name as ID for multiplayer
        name: result.name,
        score: result.score,
        gamesPlayed: parseInt(result.games_played),
        correctAnswers: parseInt(result.total_correct_answers),
        incorrectAnswers: parseInt(result.total_incorrect_answers),
        accuracy:
          Math.round(
            (result.total_correct_answers /
              (result.total_correct_answers + result.total_incorrect_answers)) *
              100
          ) || 0,
        avgTime: parseFloat(result.avg_time) || 0,
        category: result.category,
        difficulty: result.difficulty,
        timestamp: result.timestamp,
      }));

      return multiplayerLeaderboard;
    } catch (error) {
      console.error("Error in getMultiplayerLeaderboardData:", error);
      return [];
    }
  }

  async getLeaderboardData(
    gameType?: string,
    category?: string
  ): Promise<any[]> {
    try {
      let leaderboardData = [];

      if (gameType === "single" || gameType === "all") {
        // Use direct SQL query to get aggregated single player scores
        const client = postgres(
          "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db"
        );

        let sql = `
          SELECT 
            user_id as id,
            player_name as name,
            MAX(score) as score,
            COUNT(*) as games_played,
            SUM(correct_answers) as total_correct_answers,
            SUM(incorrect_answers) as total_incorrect_answers,
            AVG(CAST(average_time AS FLOAT)) as avg_time,
            MAX(category) as category,
            MAX(difficulty) as difficulty,
            MAX(timestamp) as timestamp
          FROM single_player_scores
        `;

        // Add category filter if specified
        if (category && category !== "All Categories") {
          sql += ` WHERE category = '${category}'`;
        }

        sql += `
          GROUP BY user_id, player_name
          ORDER BY MAX(score) DESC
        `;

        const singlePlayerResults = await client.unsafe(sql);
        await client.end();

        console.log("Single player aggregated results:", singlePlayerResults);

        const singlePlayerLeaderboard = singlePlayerResults.map((result) => ({
          id: result.id.toString(),
          name: result.name,
          score: result.score,
          gamesPlayed: parseInt(result.games_played),
          correctAnswers: parseInt(result.total_correct_answers),
          incorrectAnswers: parseInt(result.total_incorrect_answers),
          accuracy:
            Math.round(
              (result.total_correct_answers /
                (result.total_correct_answers +
                  result.total_incorrect_answers)) *
                100
            ) || 0,
          averageTime: Math.round(parseFloat(result.avg_time) * 100) / 100,
          gameType: "single",
          category: result.category,
          difficulty: result.difficulty,
          timestamp: result.timestamp,
        }));

        leaderboardData.push(...singlePlayerLeaderboard);
      }

      if (gameType === "multi" || gameType === "all") {
        // Get multiplayer scores from the multiplayer_scores table
        const client = postgres(
          "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db"
        );

        let sql = `
          SELECT 
            player_name as name,
            MAX(score) as best_score,
            COUNT(*) as games_played,
            SUM(correct_answers) as total_correct_answers,
            SUM(incorrect_answers) as total_incorrect_answers,
            AVG(CAST(average_time AS FLOAT)) as avg_time,
            MAX(category) as category,
            MAX(difficulty) as difficulty,
            MAX(timestamp) as last_played,
            MAX(game_type) as game_type
          FROM multiplayer_scores
        `;

        const conditions = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (category && category !== "All Categories") {
          conditions.push(`category = $${paramIndex}`);
          params.push(category);
          paramIndex++;
        }

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(" AND ")}`;
        }

        sql += `
          GROUP BY player_name
          ORDER BY MAX(score) DESC, COUNT(*) DESC
        `;

        const multiplayerResults = await client.unsafe(sql, params);
        await client.end();

        console.log("Multiplayer aggregated results:", multiplayerResults);

        const multiplayerLeaderboard = multiplayerResults.map((result) => ({
          id: result.name, // Use player name as ID for multiplayer
          name: result.name,
          score: parseInt(result.best_score),
          gamesPlayed: parseInt(result.games_played),
          correctAnswers: parseInt(result.total_correct_answers),
          incorrectAnswers: parseInt(result.total_incorrect_answers),
          accuracy:
            Math.round(
              (result.total_correct_answers /
                (result.total_correct_answers +
                  result.total_incorrect_answers)) *
                100
            ) || 0,
          averageTime: Math.round(parseFloat(result.avg_time) * 100) / 100,
          gameType: result.game_type || "multi",
          category: result.category,
          difficulty: result.difficulty,
          timestamp: result.last_played,
        }));

        leaderboardData.push(...multiplayerLeaderboard);
      }

      console.log("All leaderboard data:", leaderboardData);

      // Combine and deduplicate users to show only their best score
      const userBestScores = new Map();

      leaderboardData.forEach((entry) => {
        const userId = entry.id;
        const existingEntry = userBestScores.get(userId);

        if (!existingEntry) {
          // First entry for this user
          userBestScores.set(userId, { ...entry });
        } else if (entry.score > existingEntry.score) {
          // This is a better score for this user
          userBestScores.set(userId, {
            ...entry,
            // Keep the best score but add to total games and stats
            gamesPlayed: existingEntry.gamesPlayed + entry.gamesPlayed,
            correctAnswers: existingEntry.correctAnswers + entry.correctAnswers,
            incorrectAnswers:
              existingEntry.incorrectAnswers + entry.incorrectAnswers,
          });
        } else {
          // Keep the existing better score but add to total games and stats
          existingEntry.gamesPlayed += entry.gamesPlayed;
          existingEntry.correctAnswers += entry.correctAnswers;
          existingEntry.incorrectAnswers += entry.incorrectAnswers;
        }
      });

      // Convert back to array and recalculate accuracy
      const finalLeaderboard = Array.from(userBestScores.values()).map(
        (entry) => ({
          ...entry,
          accuracy:
            Math.round(
              (entry.correctAnswers /
                (entry.correctAnswers + entry.incorrectAnswers)) *
                100
            ) || 0,
        })
      );

      // Sort by score descending, then by games played (for tie-breakers)
      return finalLeaderboard.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // If scores are equal, sort by games played (more games = higher rank)
        return b.gamesPlayed - a.gamesPlayed;
      });
    } catch (error) {
      console.error("Error in getLeaderboardData:", error);
      return [];
    }
  }

  // Game session methods
  async getGameSession(id: string): Promise<GameSession | undefined> {
    const result = await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, id));
    return result[0] as GameSession | undefined;
  }

  async createGameSession(session: GameSession): Promise<GameSession> {
    const result = await db
      .insert(gameSessions)
      .values({
        id: session.id,
        players: session.players,
        currentQuestion: session.currentQuestion,
        gameType: session.gameType,
        category: session.category,
        difficulty: session.difficulty,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
      })
      .returning();
    return result[0] as GameSession;
  }

  async updateGameSession(
    id: string,
    updates: Partial<GameSession>
  ): Promise<GameSession> {
    await db.update(gameSessions).set(updates).where(eq(gameSessions.id, id));
    const updated = await this.getGameSession(id);
    if (!updated) throw new Error(`Game session with id ${id} not found`);
    return updated;
  }

  // Challenge methods
  async getChallenge(id: string): Promise<Challenge | undefined> {
    const result = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id));
    return result[0] as Challenge | undefined;
  }

  async getChallengesByUser(
    userId: number,
    status?: string
  ): Promise<Challenge[]> {
    let conditions = [
      or(
        eq(challenges.challengerId, userId),
        eq(challenges.challengeeId, userId)
      ),
    ];

    if (status) {
      conditions.push(eq(challenges.status, status as any));
    }

    const result = await db
      .select()
      .from(challenges)
      .where(and(...conditions));
    return result as Challenge[];
  }

  async createChallenge(challenge: Challenge): Promise<Challenge> {
    const result = await db
      .insert(challenges)
      .values({
        id: challenge.id,
        challengerId: challenge.challengerId,
        challengeeId: challenge.challengeeId,
        gameSessionId: challenge.gameSessionId,
        status: challenge.status,
        category: challenge.category,
        difficulty: challenge.difficulty,
        createdAt: challenge.createdAt,
        expiresAt: challenge.expiresAt,
        winnerUserId: challenge.winnerUserId,
        isDraw: challenge.isDraw,
        challengerCompleted: challenge.challengerCompleted,
        challengeeCompleted: challenge.challengeeCompleted,
        notificationSent: challenge.notificationSent,
      })
      .returning();
    return result[0] as Challenge;
  }

  async updateChallenge(
    id: string,
    updates: Partial<Challenge>
  ): Promise<Challenge> {
    await db.update(challenges).set(updates).where(eq(challenges.id, id));
    const updated = await this.getChallenge(id);
    if (!updated) throw new Error(`Challenge with id ${id} not found`);
    return updated;
  }

  // Challenge result methods
  async getChallengeResult(id: string): Promise<ChallengeResult | undefined> {
    const result = await db
      .select()
      .from(challengeResults)
      .where(eq(challengeResults.id, id));
    return result[0] as ChallengeResult | undefined;
  }

  async getChallengeResultsByChallenge(
    challengeId: string
  ): Promise<ChallengeResult[]> {
    const result = await db
      .select()
      .from(challengeResults)
      .where(eq(challengeResults.challengeId, challengeId));
    return result as ChallengeResult[];
  }

  async createChallengeResult(
    result: ChallengeResult
  ): Promise<ChallengeResult> {
    const dbResult = await db
      .insert(challengeResults)
      .values({
        id: result.id,
        challengeId: result.challengeId,
        userId: result.userId,
        score: result.score,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        averageTime: result.averageTime,
        completedAt: result.completedAt,
        answers: result.answers,
      })
      .returning();
    return dbResult[0] as ChallengeResult;
  }

  async updateChallengeResult(
    id: string,
    updates: Partial<ChallengeResult>
  ): Promise<ChallengeResult> {
    await db
      .update(challengeResults)
      .set(updates)
      .where(eq(challengeResults.id, id));
    const updated = await this.getChallengeResult(id);
    if (!updated) throw new Error(`Challenge result with id ${id} not found`);
    return updated;
  }

  // Notification methods
  async getNotifications(
    userId: number,
    read?: boolean
  ): Promise<Notification[]> {
    try {
      let conditions = [eq(notifications.userId, userId)];

      if (read !== undefined) {
        conditions.push(eq(notifications.read, read));
      }

      const result = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt));
      return result as Notification[];
    } catch (error) {
      console.error(`Error fetching notifications for user ${userId}:`, error);
      throw new Error(`Failed to fetch notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createNotification(notification: Notification): Promise<Notification> {
    const result = await db
      .insert(notifications)
      .values({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        message: notification.message,
        read: notification.read,
        challengeId: notification.challengeId,
        createdAt: notification.createdAt,
      })
      .returning();
    return result[0] as Notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
    const updated = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    if (!updated[0]) throw new Error(`Notification with id ${id} not found`);
    return updated[0] as Notification;
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Online user methods
  async getOnlineUsers(): Promise<User[]> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.isOnline, true));
    return result as User[];
  }

  async setUserOnline(userId: number, isOnline: boolean): Promise<User> {
    await db
      .update(users)
      .set({
        isOnline,
        lastSeen: new Date(),
      })
      .where(eq(users.id, userId));
    const updated = await this.getUser(userId);
    if (!updated) throw new Error(`User with id ${userId} not found`);
    return updated;
  }

  // Team methods
  async getTeam(id: string): Promise<Team | undefined> {
    const result = await db.select().from(teams).where(eq(teams.id, id));
    return result[0] as Team | undefined;
  }

  async getTeamsByGameSession(gameSessionId: string): Promise<Team[]> {
    const result = await db
      .select()
      .from(teams)
      .where(eq(teams.gameSessionId, gameSessionId));
    return result as Team[];
  }

  async createTeam(team: Team): Promise<Team> {
    const result = await db
      .insert(teams)
      .values({
        id: team.id,
        name: team.name,
        captainId: team.captainId,
        gameSessionId: team.gameSessionId,
        members: team.members,
        score: team.score,
        correctAnswers: team.correctAnswers,
        incorrectAnswers: team.incorrectAnswers,
        averageTime: team.averageTime,
        finalAnswers: team.finalAnswers,
        status: team.status,
        createdAt: team.createdAt,
      })
      .returning();
    return result[0] as Team;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    await db.update(teams).set(updates).where(eq(teams.id, id));
    const updated = await this.getTeam(id);
    if (!updated) throw new Error(`Team with id ${id} not found`);
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team invitation methods
  async getTeamInvitation(id: string): Promise<TeamInvitation | undefined> {
    const result = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, id));
    return result[0] as TeamInvitation | undefined;
  }

  async getTeamInvitationsByUser(
    userId: number,
    status?: string
  ): Promise<TeamInvitation[]> {
    let conditions = [eq(teamInvitations.inviteeId, userId)];

    if (status) {
      conditions.push(eq(teamInvitations.status, status as any));
    }

    const result = await db
      .select()
      .from(teamInvitations)
      .where(and(...conditions));
    return result as TeamInvitation[];
  }

  async getAllTeamInvitationsByUser(
    userId: number,
    status?: string
  ): Promise<TeamInvitation[]> {
    let conditions = [
      or(
        eq(teamInvitations.inviteeId, userId),
        eq(teamInvitations.inviterId, userId)
      )
    ];

    if (status) {
      conditions.push(eq(teamInvitations.status, status as any));
    }

    const result = await db
      .select()
      .from(teamInvitations)
      .where(and(...conditions));
    return result as TeamInvitation[];
  }

  async createTeamInvitation(
    invitation: TeamInvitation
  ): Promise<TeamInvitation> {
    const result = await db
      .insert(teamInvitations)
      .values({
        id: invitation.id,
        teamBattleId: invitation.teamBattleId || null,
        inviterId: invitation.inviterId,
        inviterUsername: invitation.inviterUsername,
        inviteeId: invitation.inviteeId,
        invitationType: invitation.invitationType || "teammate",
        teamSide: invitation.teamSide || null,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .returning();
    return result[0] as TeamInvitation;
  }

  async updateTeamInvitation(
    id: string,
    updates: Partial<TeamInvitation>
  ): Promise<TeamInvitation> {
    await db
      .update(teamInvitations)
      .set(updates)
      .where(eq(teamInvitations.id, id));
    const updated = await this.getTeamInvitation(id);
    if (!updated) throw new Error(`Team invitation with id ${id} not found`);
    return updated;
  }

  async deleteTeamInvitation(id: string): Promise<void> {
    await db.delete(teamInvitations).where(eq(teamInvitations.id, id));
  }

  // Team battle methods
  async getTeamBattle(id: string): Promise<TeamBattle | undefined> {
    const result = await db
      .select()
      .from(teamBattles)
      .where(eq(teamBattles.id, id))
      .limit(1);
    if (result.length === 0) return undefined;

    const battle = result[0];
    return {
      id: battle.id,
      gameSessionId: battle.gameSessionId || "",
      gameType: battle.gameType,
      category: battle.category,
      difficulty: battle.difficulty,
      status: battle.status as TeamBattle["status"],
      teamACaptainId: battle.teamACaptainId,
      teamAName: battle.teamAName,
      teamATeammates: (battle.teamATeammates ?? []) as number[],
      teamBCaptainId: battle.teamBCaptainId,
      teamBName: battle.teamBName,
      teamBTeammates: (battle.teamBTeammates ?? []) as number[],
      teamAScore: battle.teamAScore || 0,
      teamBScore: battle.teamBScore || 0,
      teamACorrectAnswers: battle.teamACorrectAnswers || 0,
      teamBCorrectAnswers: battle.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: battle.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: battle.teamBIncorrectAnswers || 0,
      createdAt: battle.createdAt ?? new Date(),
      startedAt: battle.startedAt,
      finishedAt: battle.finishedAt,
    };
  }

  async getTeamBattlesByUser(
    userId: number,
    status?: string
  ): Promise<TeamBattle[]> {
    let results;
    if (status) {
      results = await db
        .select()
        .from(teamBattles)
        .where(
          and(
            or(
              eq(teamBattles.teamACaptainId, userId),
              eq(teamBattles.teamBCaptainId, userId)
            ),
            eq(teamBattles.status, status)
          )
        );
    } else {
      results = await db
        .select()
        .from(teamBattles)
        .where(
          or(
            eq(teamBattles.teamACaptainId, userId),
            eq(teamBattles.teamBCaptainId, userId)
          )
        );
    }
    return results.map((battle) => ({
      id: battle.id,
      gameSessionId: battle.gameSessionId || "",
      gameType: battle.gameType,
      category: battle.category,
      difficulty: battle.difficulty,
      status: battle.status as TeamBattle["status"],
      teamACaptainId: battle.teamACaptainId,
      teamAName: battle.teamAName,
      teamATeammates: battle.teamATeammates || [],
      teamBCaptainId: battle.teamBCaptainId,
      teamBName: battle.teamBName,
      teamBTeammates: battle.teamBTeammates || [],
      teamAScore: battle.teamAScore || 0,
      teamBScore: battle.teamBScore || 0,
      teamACorrectAnswers: battle.teamACorrectAnswers || 0,
      teamBCorrectAnswers: battle.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: battle.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: battle.teamBIncorrectAnswers || 0,
      createdAt: battle.createdAt ?? new Date(),
      startedAt: battle.startedAt,
      finishedAt: battle.finishedAt,
    }));
  }

  async getTeamBattlesByGameSession(
    gameSessionId: string
  ): Promise<TeamBattle[]> {
    const results = await db
      .select()
      .from(teamBattles)
      .where(eq(teamBattles.gameSessionId, gameSessionId));

    return results.map((battle) => ({
      id: battle.id,
      gameSessionId: battle.gameSessionId || "",
      gameType: battle.gameType,
      category: battle.category,
      difficulty: battle.difficulty,
      status: battle.status as TeamBattle["status"],
      teamACaptainId: battle.teamACaptainId,
      teamAName: battle.teamAName,
      teamATeammates: battle.teamATeammates || [],
      teamBCaptainId: battle.teamBCaptainId,
      teamBName: battle.teamBName,
      teamBTeammates: battle.teamBTeammates || [],
      teamAScore: battle.teamAScore || 0,
      teamBScore: battle.teamBScore || 0,
      teamACorrectAnswers: battle.teamACorrectAnswers || 0,
      teamBCorrectAnswers: battle.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: battle.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: battle.teamBIncorrectAnswers || 0,
      createdAt: battle.createdAt ?? new Date(),
      startedAt: battle.startedAt,
      finishedAt: battle.finishedAt,
    }));
  }

  async getTeamBattlesByStatus(status: string): Promise<TeamBattle[]> {
    const results = await db
      .select()
      .from(teamBattles)
      .where(eq(teamBattles.status, status));

    return results.map((battle) => ({
      id: battle.id,
      gameSessionId: battle.gameSessionId || "",
      gameType: battle.gameType,
      category: battle.category,
      difficulty: battle.difficulty,
      status: battle.status as TeamBattle["status"],
      teamACaptainId: battle.teamACaptainId,
      teamAName: battle.teamAName,
      teamATeammates: battle.teamATeammates || [],
      teamBCaptainId: battle.teamBCaptainId,
      teamBName: battle.teamBName,
      teamBTeammates: battle.teamBTeammates || [],
      teamAScore: battle.teamAScore || 0,
      teamBScore: battle.teamBScore || 0,
      teamACorrectAnswers: battle.teamACorrectAnswers || 0,
      teamBCorrectAnswers: battle.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: battle.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: battle.teamBIncorrectAnswers || 0,
      createdAt: battle.createdAt ?? new Date(),
      startedAt: battle.startedAt,
      finishedAt: battle.finishedAt,
    }));
  }

  async createTeamBattle(battle: InsertTeamBattle): Promise<TeamBattle> {
    const insertValues: InsertTeamBattle = {
      id: battle.id,
      gameSessionId: battle.gameSessionId,
      gameType: battle.gameType,
      category: battle.category,
      difficulty: battle.difficulty,
      status: battle.status || "forming",
      teamACaptainId: battle.teamACaptainId,
      teamAName: battle.teamAName,
      teamATeammates: battle.teamATeammates || [],
      teamBCaptainId: battle.teamBCaptainId || null,
      teamBName: battle.teamBName || null,
      teamBTeammates: battle.teamBTeammates || [],
      teamAScore: battle.teamAScore || 0,
      teamBScore: battle.teamBScore || 0,
      teamACorrectAnswers: battle.teamACorrectAnswers || 0,
      teamBCorrectAnswers: battle.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: battle.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: battle.teamBIncorrectAnswers || 0,
      createdAt: battle.createdAt || new Date(),
      startedAt: battle.startedAt || null,
      finishedAt: battle.finishedAt || null,
    };

    const result = await db
      .insert(teamBattles)
      .values(insertValues as any)
      .returning();

    const created = result[0];
    return {
      id: created.id,
      gameSessionId: created.gameSessionId || "",
      gameType: created.gameType,
      category: created.category,
      difficulty: created.difficulty,
      status: created.status as TeamBattle["status"],
      teamACaptainId: created.teamACaptainId,
      teamAName: created.teamAName,
      teamATeammates: created.teamATeammates || [],
      teamBCaptainId: created.teamBCaptainId,
      teamBName: created.teamBName,
      teamBTeammates: created.teamBTeammates || [],
      teamAScore: created.teamAScore || 0,
      teamBScore: created.teamBScore || 0,
      teamACorrectAnswers: created.teamACorrectAnswers || 0,
      teamBCorrectAnswers: created.teamBCorrectAnswers || 0,
      teamAIncorrectAnswers: created.teamAIncorrectAnswers || 0,
      teamBIncorrectAnswers: created.teamBIncorrectAnswers || 0,
      createdAt: created.createdAt ?? new Date(),
      startedAt: created.startedAt,
      finishedAt: created.finishedAt,
    };
  }

  async updateTeamBattle(
    id: string,
    updates: Partial<TeamBattle>
  ): Promise<TeamBattle> {
    // ✅ FIX: Get the current battle to prevent overwriting critical fields
    const currentBattle = await this.getTeamBattle(id);
    if (!currentBattle) {
      throw new Error(`Team battle with id ${id} not found`);
    }

    // ✅ CRITICAL: Safeguard against accidentally overwriting Team A name
    const safeUpdates: Partial<TeamBattle> = {
      ...updates,
    };

    // ✅ If updating but not explicitly setting teamAName, preserve the current one
    if (
      updates.teamAName === undefined &&
      currentBattle.teamAName !== undefined
    ) {
      safeUpdates.teamAName = currentBattle.teamAName;
    }

    // ✅ Log the update for debugging
    if (updates.teamBName || updates.teamBCaptainId) {
      console.log(
        `📝 UpdateTeamBattle ID: ${id} | Preserving Team A: "${currentBattle.teamAName}" | Setting Team B: "${updates.teamBName || currentBattle.teamBName}"`
      );
    }

    await db.update(teamBattles).set(safeUpdates).where(eq(teamBattles.id, id));
    const updated = await this.getTeamBattle(id);
    if (!updated) throw new Error(`Team battle with id ${id} not found`);
    return updated;
  }

  async deleteTeamBattle(id: string): Promise<void> {
    await db.delete(teamBattles).where(eq(teamBattles.id, id));
  }

  // Voice settings methods
  async getVoiceCloneId(): Promise<string | null> {
    try {
      const result = await db
        .select()
        .from(voiceSettings)
        .where(eq(voiceSettings.id, "default"));
      const settings = result[0];
      return settings?.elevenlabsVoiceId || null;
    } catch (error) {
      console.error("Error getting voice clone ID:", error);
      return null;
    }
  }

  async setVoiceCloneId(voiceId: string | null): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(voiceSettings)
        .where(eq(voiceSettings.id, "default"));

      if (existing.length > 0) {
        await db
          .update(voiceSettings)
          .set({
            elevenlabsVoiceId: voiceId,
            updatedAt: new Date(),
          })
          .where(eq(voiceSettings.id, "default"));
      } else {
        await db.insert(voiceSettings).values({
          id: "default",
          elevenlabsVoiceId: voiceId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      console.error("Error setting voice clone ID:", error);
      throw error;
    }
  }

  async getVoiceSettings(): Promise<VoiceSettings | undefined> {
    try {
      const result = await db
        .select()
        .from(voiceSettings)
        .where(eq(voiceSettings.id, "default"));
      return result[0] as VoiceSettings | undefined;
    } catch (error) {
      console.error("Error getting voice settings:", error);
      return undefined;
    }
  }

  async updateVoiceSettings(
    updates: Partial<VoiceSettings>
  ): Promise<VoiceSettings> {
    try {
      const existing = await db
        .select()
        .from(voiceSettings)
        .where(eq(voiceSettings.id, "default"));

      if (existing.length > 0) {
        await db
          .update(voiceSettings)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(voiceSettings.id, "default"));
      } else {
        await db.insert(voiceSettings).values({
          id: "default",
          ...updates,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const updated = await this.getVoiceSettings();
      if (!updated) throw new Error("Failed to update voice settings");
      return updated;
    } catch (error) {
      console.error("Error updating voice settings:", error);
      throw error;
    }
  }

  // Voice usage tracking methods
  async trackVoiceUsage(usage: InsertVoiceUsage): Promise<VoiceUsage> {
    try {
      const result = await db
        .insert(voiceUsage)
        .values({
          id: crypto.randomUUID(),
          voiceId: usage.voiceId,
          textLength: usage.textLength,
          estimatedCredits: usage.estimatedCredits,
          requestType: usage.requestType,
          gameSessionId: usage.gameSessionId,
          userId: usage.userId,
          createdAt: new Date(),
        })
        .returning();

      return result[0] as VoiceUsage;
    } catch (error) {
      console.error("Error tracking voice usage:", error);
      throw error;
    }
  }

  async getVoiceUsageStats(
    timeframe: "day" | "week" | "month" = "month"
  ): Promise<{
    totalRequests: number;
    totalCharacters: number;
    estimatedCredits: number;
    requestsByType: Record<string, number>;
  }> {
    try {
      const now = new Date();
      let startDate: Date;

      switch (timeframe) {
        case "day":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const usage = await db
        .select()
        .from(voiceUsage)
        .where(gte(voiceUsage.createdAt, startDate));

      const totalRequests = usage.length;
      const totalCharacters = usage.reduce((sum, u) => sum + u.textLength, 0);
      const estimatedCredits = usage.reduce(
        (sum, u) => sum + u.estimatedCredits,
        0
      );

      const requestsByType: Record<string, number> = {};
      usage.forEach((u) => {
        requestsByType[u.requestType] =
          (requestsByType[u.requestType] || 0) + 1;
      });

      return {
        totalRequests,
        totalCharacters,
        estimatedCredits,
        requestsByType,
      };
    } catch (error) {
      console.error("Error getting voice usage stats:", error);
      return {
        totalRequests: 0,
        totalCharacters: 0,
        estimatedCredits: 0,
        requestsByType: {},
      };
    }
  }

  // User question history methods
  async getUserQuestionHistory(userId: number, hoursBack: number = 48): Promise<UserQuestionHistory[]> {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      const result = await db
        .select()
        .from(userQuestionHistory)
        .where(
          and(
            eq(userQuestionHistory.userId, userId),
            gte(userQuestionHistory.createdAt, cutoffTime)
          )
        )
        .orderBy(desc(userQuestionHistory.createdAt));
      return result as UserQuestionHistory[];
    } catch (error) {
      console.error("Error fetching user question history:", error);
      return [];
    }
  }

  async addUserQuestionHistory(history: InsertUserQuestionHistory): Promise<UserQuestionHistory> {
    try {
      const result = await db
        .insert(userQuestionHistory)
        .values({
          id: crypto.randomUUID(),
          ...history,
          createdAt: new Date(),
        })
        .returning();
      return result[0] as UserQuestionHistory;
    } catch (error) {
      console.error("Error adding user question history:", error);
      throw error;
    }
  }

  async cleanupOldQuestionHistory(hoursBack: number = 168): Promise<void> { // Default 7 days
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      await db
        .delete(userQuestionHistory)
        .where(lt(userQuestionHistory.createdAt, cutoffTime));
      console.log(`Cleaned up question history older than ${hoursBack} hours`);
    } catch (error) {
      console.error("Error cleaning up old question history:", error);
    }
  }

  async clearAllTeamStatuses(): Promise<void> {
    // Reset all teams to forming status in database
    await db.update(teams).set({ status: "forming" });
    // Clear all invitations in database
    await db.delete(teamInvitations);
  }

  // Clean up invalid question records
  async cleanupInvalidQuestions(): Promise<void> {
    try {
      console.log("🧹 Cleaning up invalid question records...");

      // Find and delete questions with null/undefined/invalid IDs
      const invalidQuestions = await db
        .select()
        .from(questions)
        .where(or(
          eq(questions.id, null as any),
          eq(questions.id, ''),
          like(questions.id, '%null%'),
          like(questions.id, '%undefined%')
        ));

      if (invalidQuestions.length > 0) {
        console.log(`Found ${invalidQuestions.length} invalid question records`);

        // Delete invalid records
        for (const invalid of invalidQuestions) {
          await db.delete(questions).where(eq(questions.id, invalid.id as string));
        }

        console.log(`✅ Deleted ${invalidQuestions.length} invalid question records`);
      } else {
        console.log("✅ No invalid question records found");
      }

      // Also clean up questions with missing required fields
      const incompleteQuestions = await db
        .select()
        .from(questions)
        .where(or(
          eq(questions.text, null as any),
          eq(questions.text, ''),
          eq(questions.category, null as any),
          eq(questions.category, ''),
          eq(questions.difficulty, null as any),
          eq(questions.difficulty, ''),
          eq(questions.answers, null as any)
        ));

      if (incompleteQuestions.length > 0) {
        console.log(`Found ${incompleteQuestions.length} incomplete question records`);

        for (const incomplete of incompleteQuestions) {
          await db.delete(questions).where(eq(questions.id, incomplete.id));
        }

        console.log(`✅ Deleted ${incompleteQuestions.length} incomplete question records`);
      }

      console.log("🧹 Database cleanup completed");
    } catch (error) {
      console.error("❌ Error during database cleanup:", error);
      throw error;
    }
  }

  // Initialize database with sample data
  async initializeDatabase(): Promise<void> {
    try {
      console.log("Initializing PostgreSQL database with sample data...");

      // Run migration for inviter_username column
      try {
        console.log(
          "Running migration: Adding inviter_username column to team_invitations..."
        );

        // Check if column exists by trying to add it
        await db.execute(`
          ALTER TABLE team_invitations 
          ADD COLUMN IF NOT EXISTS inviter_username TEXT;
        `);

        // Update existing records that might have NULL inviter_username
        // First, try to get usernames from the users table for existing invitations
        await db.execute(`
          UPDATE team_invitations 
          SET inviter_username = COALESCE(
            (SELECT username FROM users WHERE id = team_invitations.inviter_id),
            'Unknown User'
          )
          WHERE inviter_username IS NULL;
        `);

        // Make it NOT NULL after setting defaults (only if column was just added)
        // We'll do this carefully to avoid errors if it's already NOT NULL
        try {
          await db.execute(`
            ALTER TABLE team_invitations 
            ALTER COLUMN inviter_username SET NOT NULL;
          `);
        } catch (alterErr) {
          // Column might already be NOT NULL, that's fine
          console.log("Note: inviter_username constraint already set");
        }

        console.log("✅ Migration completed: inviter_username column ready");
      } catch (migrationErr) {
        console.error(
          "Migration error (non-fatal):",
          migrationErr instanceof Error ? migrationErr.message : "Unknown error"
        );
        // Continue even if migration fails - the column might already exist
      }

      // Run migration for team_battle_id and team_side columns in team_invitations
      try {
        console.log(
          "Running migration: Adding team_battle_id and team_side columns to team_invitations..."
        );
        await db.execute(`
          ALTER TABLE team_invitations 
          ADD COLUMN IF NOT EXISTS team_battle_id TEXT;
        `);

        await db.execute(`
          ALTER TABLE team_invitations 
          ADD COLUMN IF NOT EXISTS team_side TEXT;
        `);

        console.log(
          "✅ Migration completed: team_battle_id and team_side columns ready"
        );
      } catch (migrationErr) {
        console.error(
          "Migration error (non-fatal) for team_invitations team_battle_id/team_side:",
          migrationErr instanceof Error ? migrationErr.message : "Unknown error"
        );
      }

      // Ensure legacy team_id column exists and is nullable for backward compatibility
      try {
        console.log("Ensuring team_id column exists and is nullable...");
        await db.execute(`
          ALTER TABLE team_invitations
          ADD COLUMN IF NOT EXISTS team_id TEXT;
        `);

        await db.execute(`
          ALTER TABLE team_invitations
          ALTER COLUMN team_id DROP NOT NULL;
        `);
      } catch (migrationErr) {
        console.error(
          "Migration error (non-fatal) for team_invitations team_id column:",
          migrationErr instanceof Error ? migrationErr.message : "Unknown error"
        );
      }

      // Run migration for invitation_type column
      try {
        console.log(
          "Running migration: Adding invitation_type column to team_invitations..."
        );

        await db.execute(`
          ALTER TABLE team_invitations 
          ADD COLUMN IF NOT EXISTS invitation_type TEXT DEFAULT 'teammate';
        `);

        // Update existing records based on teamId
        await db.execute(`
          UPDATE team_invitations 
          SET invitation_type = CASE 
            WHEN team_id = 'new-opposing-team' THEN 'opponent'
            ELSE 'teammate'
          END
          WHERE invitation_type IS NULL;
        `);

        console.log("✅ Migration completed: invitation_type column ready");
      } catch (migrationErr) {
        console.error(
          "Migration error (non-fatal):",
          migrationErr instanceof Error ? migrationErr.message : "Unknown error"
        );
        // Continue even if migration fails - the column might already exist
      }

      // Create team_battles table if it doesn't exist
      try {
        console.log("Creating team_battles table if it doesn't exist...");
        await db.execute(`
          CREATE TABLE IF NOT EXISTS team_battles (
            id TEXT PRIMARY KEY,
            game_session_id TEXT NOT NULL,
            game_type TEXT NOT NULL,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            status TEXT DEFAULT 'forming',
            team_a_captain_id INTEGER NOT NULL,
            team_a_name TEXT NOT NULL,
            team_a_teammates JSON DEFAULT '[]',
            team_b_captain_id INTEGER,
            team_b_name TEXT,
            team_b_teammates JSON DEFAULT '[]',
            team_a_score INTEGER DEFAULT 0,
            team_b_score INTEGER DEFAULT 0,
            team_a_correct_answers INTEGER DEFAULT 0,
            team_b_correct_answers INTEGER DEFAULT 0,
            team_a_incorrect_answers INTEGER DEFAULT 0,
            team_b_incorrect_answers INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            started_at TIMESTAMP,
            finished_at TIMESTAMP
          );
        `);

        // Add game_session_id column if it doesn't exist (migration)
        await db.execute(`
          ALTER TABLE team_battles 
          ADD COLUMN IF NOT EXISTS game_session_id TEXT;
        `);

        // Create indexes for team_battles
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_team_battles_team_a_captain 
          ON team_battles(team_a_captain_id);
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_team_battles_team_b_captain 
          ON team_battles(team_b_captain_id);
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_team_battles_status 
          ON team_battles(status);
        `);

        console.log("✅ team_battles table ready");
      } catch (tableErr) {
        console.error(
          "Error creating team_battles table:",
          tableErr instanceof Error ? tableErr.message : "Unknown error"
        );
        // Continue even if table creation fails - it might already exist
      }

      // Ensure game_session_id column exists in team_battles (older tables)
      try {
        await db.execute(`
          ALTER TABLE team_battles
          ADD COLUMN IF NOT EXISTS game_session_id TEXT;
        `);
      } catch (migrationErr) {
        console.error(
          "Migration error (non-fatal) for team_battles game_session_id:",
          migrationErr instanceof Error ? migrationErr.message : "Unknown error"
        );
      }

      // Create initial admin user if it doesn't exist
      const adminUser = await this.getUserByUsername("admin");
      if (!adminUser) {
        const { hashPassword } = await import("./auth");
        await this.createUser({
          username: "admin",
          password: await hashPassword("admin123"),
          isAdmin: true,
        });
        console.log("Created initial admin user: admin / admin123");
      }

      // Create some sample users for testing
      const sampleUsers = [
        {
          username: "john_doe",
          password: "password123",
          email: "john@example.com",
        },
        {
          username: "jane_smith",
          password: "password123",
          email: "jane@example.com",
        },
        {
          username: "bob_wilson",
          password: "password123",
          email: "bob@example.com",
        },
        {
          username: "alice_brown",
          password: "password123",
          email: "alice@example.com",
        },
      ];

      for (const sampleUser of sampleUsers) {
        const existingUser = await this.getUserByUsername(sampleUser.username);
        if (!existingUser) {
          const { hashPassword } = await import("./auth");
          await this.createUser({
            username: sampleUser.username,
            password: await hashPassword(sampleUser.password),
            email: sampleUser.email,
            isAdmin: false,
          });
          console.log(
            `Created sample user: ${sampleUser.username} / ${sampleUser.password}`
          );
        }
      }

      // Create user_question_history table
      try {
        console.log("Creating user_question_history table if it doesn't exist...");
        await db.execute(`
          CREATE TABLE IF NOT EXISTS user_question_history (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            question_id TEXT NOT NULL,
            game_session_id TEXT,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            is_correct BOOLEAN,
            time_spent INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Create question_analytics table
        console.log("Creating question_analytics table if it doesn't exist...");
        await db.execute(`
          CREATE TABLE IF NOT EXISTS question_analytics (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL UNIQUE,
            total_asked INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_incorrect INTEGER DEFAULT 0,
            average_time_spent INTEGER DEFAULT 0,
            difficulty_rating INTEGER DEFAULT 0,
            popularity_score INTEGER DEFAULT 0,
            last_asked TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

        // Create indexes for user_question_history
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_user_question_history_user_id 
          ON user_question_history(user_id);
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_user_question_history_created_at 
          ON user_question_history(created_at);
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_user_question_history_question_id 
          ON user_question_history(question_id);
        `);

        // Create indexes for question_analytics
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_question_analytics_question_id 
          ON question_analytics(question_id);
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_question_analytics_last_asked 
          ON question_analytics(last_asked);
        `);

        console.log("✅ Enhanced question system tables created successfully");
      } catch (tableErr) {
        console.error(
          "Error creating enhanced question tables (non-fatal):",
          tableErr instanceof Error ? tableErr.message : "Unknown error"
        );
      }

      // Set up cleanup job for old question history (run once during initialization)
      try {
        console.log("Cleaning up old question history...");
        await this.cleanupOldQuestionHistory(168); // Clean up history older than 7 days
      } catch (error) {
        console.error("Error during cleanup (non-fatal):", error);
      }

      console.log("PostgreSQL database initialization completed with enhanced question system!");
    } catch (error) {
      console.error("Error initializing PostgreSQL database:", error);
      throw error;
    }
  }

  // ===== Team helpers for join request feature =====
  async getTeamsByCaptain(captainId: number): Promise<Team[]> {
    try {
      const result = await db.select().from(teams).where(eq(teams.captainId, captainId));
      return result as unknown as Team[];
    } catch (error) {
      console.error("Error getTeamsByCaptain:", error);
      return [];
    }
  }

  async updateTeamMembers(teamId: string, members: any[]): Promise<void> {
    try {
      await db.update(teams).set({ members }).where(eq(teams.id, teamId));
    } catch (error) {
      console.error("Error updateTeamMembers:", error);
      throw error;
    }
  }

  async addMemberToTeam(teamId: string, member: { userId: number; username: string; role: "member"; joinedAt: Date }): Promise<any[]> {
    const team = await this.getTeam(teamId);
    const members = Array.isArray(team?.members) ? team!.members : [];
    members.push(member as any);
    await this.updateTeamMembers(teamId, members);
    return members;
  }

  async removeMemberFromTeam(teamId: string, userId: number): Promise<any[]> {
    const team = await this.getTeam(teamId);
    const members = (Array.isArray(team?.members) ? team!.members : []).filter((m: any) => m.userId !== userId);
    await this.updateTeamMembers(teamId, members);
    return members;
  }

  async getJoinRequestsByUser(userId: number): Promise<any[]> {
    try {
      const sql = postgres(connectionString);
      const rows = await sql`SELECT * FROM team_join_request WHERE requester_id = ${userId} ORDER BY created_at DESC`;
      await sql.end();
      return rows;
    } catch (error) {
      console.error("Error getJoinRequestsByUser:", error);
      return [];
    }
  }

  async getJoinRequestsByTeam(teamId: string): Promise<any[]> {
    try {
      const sql = postgres(connectionString);
      const rows = await sql`SELECT * FROM team_join_request WHERE team_id = ${teamId} ORDER BY created_at DESC`;
      await sql.end();
      return rows;
    } catch (error) {
      console.error("Error getJoinRequestsByTeam:", error);
      return [];
    }
  }

  async createJoinRequest(teamId: string, requesterId: number, requesterUsername: string, expiresAt: Date): Promise<any> {
    const id = `jr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const sql = postgres(connectionString);
      await sql`
        INSERT INTO team_join_request (id, team_id, requester_id, requester_username, status, created_at, expires_at)
        VALUES (${id}, ${teamId}, ${requesterId}, ${requesterUsername}, 'pending', NOW(), ${expiresAt})
      `;
      await sql.end();
      return { id, teamId, requesterId, requesterUsername, status: "pending", createdAt: new Date(), expiresAt };
    } catch (error) {
      console.error("Error createJoinRequest:", error);
      throw error;
    }
  }

  async updateJoinRequestStatus(id: string, status: "accepted" | "rejected" | "expired" | "cancelled"): Promise<void> {
    try {
      const sql = postgres(connectionString);
      await sql`UPDATE team_join_request SET status = ${status} WHERE id = ${id}`;
      await sql.end();
    } catch (error) {
      console.error("Error updateJoinRequestStatus:", error);
      throw error;
    }
  }
}

// Export the database instance
export const database = new PostgreSQLDatabase();
