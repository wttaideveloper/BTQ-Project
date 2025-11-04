import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, or, like, desc, asc, gte } from "drizzle-orm";
import postgres from "postgres";
import { 
  users, 
  teams,
  teamInvitations,
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
  type InsertSinglePlayerScore,
  type VoiceSettings,
  type InsertVoiceSettings,
  type VoiceUsage,
  type InsertVoiceUsage
} from "@shared/schema";

// Production PostgreSQL Database Connection
const connectionString = process.env.DATABASE_URL || "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db";

// Ensure the connection string is properly formatted
if (!connectionString || typeof connectionString !== 'string') {
  throw new Error('DATABASE_URL must be a valid string');
}

console.log("🔗 Connecting to database:", connectionString.replace(/:[^:@]*@/, ':****@')); // Hide password in logs

const client = postgres(connectionString, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout
  onnotice: () => {}, // Suppress notices
  // For production, disable SSL for local connections
  ssl: false,
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
  getQuestions(filters: { category?: string; difficulty?: string; search?: string }): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: Question): Promise<Question>;
  updateQuestion(id: string, question: Question): Promise<Question>;
  deleteQuestion(id: string): Promise<void>;
  getRandomQuestions(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]>;
  
  // Game result methods
  saveGameResult(result: GameResult): Promise<GameResult>;
  getGameResults(): Promise<GameResult[]>;
  
  // Single player score methods
  saveSinglePlayerScore(score: InsertSinglePlayerScore): Promise<any>;
  getSinglePlayerScores(filters?: { userId?: number; category?: string; difficulty?: string; gameType?: string }): Promise<any[]>;
  getLeaderboardData(gameType?: string, category?: string): Promise<any[]>;
  
  // Multiplayer score methods
  saveMultiplayerScore(score: any): Promise<any>;
  getMultiplayerScores(filters?: { gameSessionId?: string; playerName?: string; category?: string; difficulty?: string }): Promise<any[]>;
  getMultiplayerLeaderboardData(category?: string, difficulty?: string): Promise<any[]>;
  
  // Game session methods
  getGameSession(id: string): Promise<GameSession | undefined>;
  createGameSession(session: GameSession): Promise<GameSession>;
  updateGameSession(id: string, session: Partial<GameSession>): Promise<GameSession>;
  
  // Challenge methods
  getChallenge(id: string): Promise<Challenge | undefined>;
  getChallengesByUser(userId: number, status?: string): Promise<Challenge[]>;
  createChallenge(challenge: Challenge): Promise<Challenge>;
  updateChallenge(id: string, updates: Partial<Challenge>): Promise<Challenge>;
  
  // Challenge result methods
  getChallengeResult(id: string): Promise<ChallengeResult | undefined>;
  getChallengeResultsByChallenge(challengeId: string): Promise<ChallengeResult[]>;
  createChallengeResult(result: ChallengeResult): Promise<ChallengeResult>;
  updateChallengeResult(id: string, updates: Partial<ChallengeResult>): Promise<ChallengeResult>;
  
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
  getTeamInvitationsByUser(userId: number, status?: string): Promise<TeamInvitation[]>;
  createTeamInvitation(invitation: TeamInvitation): Promise<TeamInvitation>;
  updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation>;
  deleteTeamInvitation(id: string): Promise<void>;
  
  // Voice settings methods
  getVoiceCloneId(): Promise<string | null>;
  setVoiceCloneId(voiceId: string | null): Promise<void>;
  getVoiceSettings(): Promise<VoiceSettings | undefined>;
  updateVoiceSettings(updates: Partial<VoiceSettings>): Promise<VoiceSettings>;
  
  // Voice usage tracking methods
  trackVoiceUsage(usage: InsertVoiceUsage): Promise<VoiceUsage>;
  getVoiceUsageStats(timeframe?: 'day' | 'week' | 'month'): Promise<{
    totalRequests: number;
    totalCharacters: number;
    estimatedCredits: number;
    requestsByType: Record<string, number>;
  }>;
  
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
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0] as User | undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.select().from(users).orderBy(asc(users.username));
    return result as User[];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values({
      username: user.username,
      password: user.password,
      email: user.email,
      isAdmin: user.isAdmin ?? false,
      isOnline: false,
      lastSeen: new Date(),
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0
    }).returning();
    return result[0] as User;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    await db.update(users).set(updates).where(eq(users.id, id));
    const updated = await this.getUser(id);
    if (!updated) throw new Error(`User with id ${id} not found`);
    return updated;
  }

  // Question methods - Get questions from database only
  async getQuestions(filters: { category?: string; difficulty?: string; search?: string }): Promise<Question[]> {
    try {
      // Get questions from database
      let dbQuestions = await db.select().from(questions);
      let questionList = dbQuestions.map(q => ({
        id: q.id,
        text: q.text,
        context: q.context || undefined,
        category: q.category,
        difficulty: q.difficulty,
        answers: q.answers
      })) as Question[];
      
      console.log(`📊 Retrieved ${questionList.length} questions from database`);
      
      let filteredQuestions = questionList;
      
      if (filters.category) {
        filteredQuestions = filteredQuestions.filter(q => q.category === filters.category);
        console.log(`📂 Filtered by category '${filters.category}': ${filteredQuestions.length} questions`);
      }
      
      if (filters.difficulty) {
        filteredQuestions = filteredQuestions.filter(q => q.difficulty === filters.difficulty);
        console.log(`🎯 Filtered by difficulty '${filters.difficulty}': ${filteredQuestions.length} questions`);
      }
      
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredQuestions = filteredQuestions.filter(q => 
          q.text.toLowerCase().includes(searchTerm) ||
          (q.context && q.context.toLowerCase().includes(searchTerm)) ||
          q.answers.some(a => a.text.toLowerCase().includes(searchTerm))
        );
        console.log(`🔍 Filtered by search '${filters.search}': ${filteredQuestions.length} questions`);
      }
      
      return filteredQuestions;
    } catch (error) {
      console.error("❌ Error fetching questions from database:", error);
      throw new Error(`Failed to fetch questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    try {
      const dbQuestion = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
      
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
        answers: q.answers
      } as Question;
    } catch (error) {
      console.error("❌ Error fetching question from database:", error);
      return undefined;
    }
  }

  async createQuestion(question: Question): Promise<Question> {
    try {
      const result = await db.insert(questions).values({
        id: question.id,
        text: question.text,
        context: question.context,
        category: question.category,
        difficulty: question.difficulty,
        answers: question.answers,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      console.log(`Question stored in database with ID: ${question.id}`);
      return result[0] as Question;
    } catch (error) {
      console.error("Error storing question in database:", error);
      throw new Error(`Failed to store question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateQuestion(id: string, question: Question): Promise<Question> {
    try {
      const result = await db.update(questions)
        .set({
          text: question.text,
          context: question.context,
          category: question.category,
          difficulty: question.difficulty,
          answers: question.answers,
          updatedAt: new Date()
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
      throw new Error(`Failed to update question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteQuestion(id: string): Promise<void> {
    try {
      const result = await db.delete(questions)
        .where(eq(questions.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Question with ID ${id} not found`);
      }
      
      console.log(`✅ Question deleted from database: ${id}`);
    } catch (error) {
      console.error("❌ Error deleting question from database:", error);
      throw new Error(`Failed to delete question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRandomQuestions(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]> {
    try {
      console.log(`🎲 Getting ${filters.count} random questions with filters:`, filters);
      
      // Step 1: Use optimized database queries instead of loading all questions
      const selectedQuestions = await this.optimizedRandomSelection(filters);
      
      // Step 2: Shuffle questions and answers for each question
      const shuffledQuestions = this.shuffleQuestionsAndAnswers(selectedQuestions);
      
      console.log(`✅ Selected and shuffled ${shuffledQuestions.length} questions with randomized answers`);
      return shuffledQuestions;
      
    } catch (error) {
      console.error("❌ Error in getRandomQuestions:", error);
      throw new Error(`Failed to get random questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Optimized Random Selection for Large Datasets (1000+ questions)
   * 
   * Algorithm: Enhanced Random Selection with Guaranteed Count
   * Time Complexity: O(log n) for database queries + O(k) for selection
   * Space Complexity: O(k) where k = questions to select
   * 
   * Strategy:
   * 1. Always use memory-based selection for better randomness
   * 2. Ensure exact count is returned
   * 3. Enhanced shuffling for true randomness
   * 4. Fallback mechanisms for edge cases
   */
  private async optimizedRandomSelection(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]> {
    try {
      // Get total question count
      const totalCount = await this.getQuestionCount();
      console.log(`📊 Total questions in database: ${totalCount}`);
      
      if (totalCount === 0) {
        console.log("❌ No questions available in database");
        return [];
      }
      
      // Always use memory-based selection for better randomness and guaranteed count
      console.log("🔄 Using enhanced memory-based algorithm for optimal randomness");
      return this.enhancedMemoryBasedSelection(filters);
      
    } catch (error) {
      console.error("❌ Error in optimized random selection:", error);
      // Fallback to basic memory-based selection
      console.log("🔄 Falling back to basic memory-based selection");
      return this.memoryBasedRandomSelection(filters);
    }
  }

    /**
   * Database-Level Random Sampling
   * 
   * Algorithm: Enhanced SQL ORDER BY RANDOM() with multiple random seeds
   * Time Complexity: O(log n) for database queries
   * Space Complexity: O(k) where k = questions to select
   * 
   * This is optimal for large datasets (1000+ questions)
   */
  private async databaseLevelRandomSelection(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]> {
    const selectedQuestions: Question[] = [];
    
    try {
      // Calculate selection weights with more variety
      const primaryCount = Math.ceil(filters.count * 0.7); // 70% from primary
      const secondaryCount = Math.ceil(filters.count * 0.2); // 20% from secondary
      const tertiaryCount = filters.count - primaryCount - secondaryCount; // 10% from tertiary
      
      console.log(`📊 Database selection breakdown: ${primaryCount} primary, ${secondaryCount} secondary, ${tertiaryCount} tertiary`);
      
      // Step 1: Get primary candidates (filtered questions) using database random sampling
      if (filters.category && filters.category !== "All Categories") {
        const primaryQuery = this.buildEnhancedRandomQuery(filters.category, filters.difficulty || null, primaryCount);
        const primaryResults = await this.executeRandomQuery(primaryQuery);
        selectedQuestions.push(...primaryResults);
        console.log(`✅ Selected ${primaryResults.length} questions from primary candidates`);
        
        // Step 2: Get secondary candidates (same difficulty, different categories)
        if (secondaryCount > 0) {
          const secondaryQuery = this.buildEnhancedRandomQuery(null, filters.difficulty || null, secondaryCount, filters.category);
          const secondaryResults = await this.executeRandomQuery(secondaryQuery);
          selectedQuestions.push(...secondaryResults);
          console.log(`✅ Selected ${secondaryResults.length} questions from secondary candidates`);
        }
        
        // Step 3: Get tertiary candidates (different difficulty, different categories)
        if (tertiaryCount > 0) {
          const tertiaryQuery = this.buildEnhancedRandomQuery(null, null, tertiaryCount, filters.category);
          const tertiaryResults = await this.executeRandomQuery(tertiaryQuery);
          selectedQuestions.push(...tertiaryResults);
          console.log(`✅ Selected ${tertiaryResults.length} questions from tertiary candidates`);
        }
      } else if (filters.difficulty) {
        // Only difficulty filter
        const primaryQuery = this.buildEnhancedRandomQuery(null, filters.difficulty, primaryCount);
        const primaryResults = await this.executeRandomQuery(primaryQuery);
        selectedQuestions.push(...primaryResults);
        console.log(`✅ Selected ${primaryResults.length} questions from primary candidates`);
        
        if (secondaryCount > 0) {
          const secondaryQuery = this.buildEnhancedRandomQuery(null, null, secondaryCount, null, filters.difficulty);
          const secondaryResults = await this.executeRandomQuery(secondaryQuery);
          selectedQuestions.push(...secondaryResults);
          console.log(`✅ Selected ${secondaryResults.length} questions from secondary candidates`);
        }
      } else {
        // No filters - pure random selection with enhanced randomness
        const randomQuery = this.buildEnhancedRandomQuery(null, null, filters.count);
        const randomResults = await this.executeRandomQuery(randomQuery);
        selectedQuestions.push(...randomResults);
        console.log(`✅ Selected ${randomResults.length} questions using pure random selection`);
      }
      
      // Step 4: Enhanced final shuffle with multiple passes
      const finalShuffle = this.enhancedShuffle(selectedQuestions);
      
      console.log(`🎲 Final selection: ${finalShuffle.length} questions with ${new Set(finalShuffle.map((q: Question) => q.category)).size} categories`);
      return finalShuffle;
      
    } catch (error) {
      console.error("❌ Error in database-level random selection:", error);
      throw error;
    }
  }

  /**
   * Build optimized SQL query for random selection
   */
  private buildRandomQuery(
    category: string | null, 
    difficulty: string | null, 
    limit: number,
    excludeCategory: string | null = null,
    excludeDifficulty: string | null = null
  ): { sql: string; params: any[] } {
    let whereConditions = [];
    let params: any[] = [];
    let paramIndex = 1;
    
    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    
    if (difficulty) {
      whereConditions.push(`difficulty = $${paramIndex}`);
      params.push(difficulty);
      paramIndex++;
    }
    
    if (excludeCategory) {
      whereConditions.push(`category != $${paramIndex}`);
      params.push(excludeCategory);
      paramIndex++;
    }
    
    if (excludeDifficulty) {
      whereConditions.push(`difficulty != $${paramIndex}`);
      params.push(excludeDifficulty);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    return {
      sql: `SELECT * FROM questions ${whereClause} ORDER BY RANDOM() LIMIT $${paramIndex}`,
      params: [...params, limit]
    };
  }

  /**
   * Build enhanced SQL query with multiple random seeds for better variety
   */
  private buildEnhancedRandomQuery(
    category: string | null, 
    difficulty: string | null, 
    limit: number,
    excludeCategory: string | null = null,
    excludeDifficulty: string | null = null
  ): { sql: string; params: any[] } {
    let whereConditions = [];
    let params: any[] = [];
    let paramIndex = 1;
    
    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    
    if (difficulty) {
      whereConditions.push(`difficulty = $${paramIndex}`);
      params.push(difficulty);
      paramIndex++;
    }
    
    if (excludeCategory) {
      whereConditions.push(`category != $${paramIndex}`);
      params.push(excludeCategory);
      paramIndex++;
    }
    
    if (excludeDifficulty) {
      whereConditions.push(`difficulty != $${paramIndex}`);
      params.push(excludeDifficulty);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Enhanced randomness with multiple random seeds and timestamp
    const randomSeed = Math.floor(Math.random() * 1000000);
    const timestamp = Date.now();
    
    return {
      sql: `SELECT * FROM questions ${whereClause} ORDER BY (RANDOM() * ${randomSeed} + EXTRACT(EPOCH FROM NOW()) * ${timestamp}) LIMIT $${paramIndex}`,
      params: [...params, limit]
    };
  }

  /**
   * Execute random query with error handling
   */
  private async executeRandomQuery(query: { sql: string; params: any[] }): Promise<Question[]> {
    try {
      const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
      const result = await client.unsafe(query.sql, query.params);
      await client.end();
      
      return result.map(q => ({
        id: q.id,
        text: q.text,
        context: q.context || undefined,
        category: q.category,
        difficulty: q.difficulty,
        answers: q.answers
      })) as Question[];
    } catch (error) {
      console.error("❌ Error executing random query:", error);
      return [];
    }
  }

  /**
   * Get total question count efficiently
   */
  private async getQuestionCount(): Promise<number> {
    try {
      const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
      const result = await client.unsafe("SELECT COUNT(*) as count FROM questions");
      await client.end();
      return parseInt(result[0].count) || 0;
    } catch (error) {
      console.error("❌ Error getting question count:", error);
      return 0;
    }
  }

  /**
   * Enhanced Memory-based random selection with guaranteed count
   * Ensures exact number of questions and maximum randomness
   */
  private async enhancedMemoryBasedSelection(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]> {
    // STRICT FILTERING: If category is specified, ONLY return questions from that category
    if (filters.category && filters.category !== "All Categories") {
      console.log(`🔍 STRICT FILTER: category="${filters.category}", difficulty="${filters.difficulty}"`);
      
      // Get questions filtered by category and difficulty
      const filteredQuestions = await this.getQuestions({
        category: filters.category,
        difficulty: filters.difficulty
      });
      
      console.log(`📊 Found ${filteredQuestions.length} questions matching filters`);
      
      // Double-check with case-insensitive comparison
      const strictMatches = filteredQuestions.filter(q => {
        const qCategory = (q.category || '').trim().toLowerCase();
        const filterCategory = (filters.category || '').trim().toLowerCase();
        const categoryMatch = qCategory === filterCategory;
        
        let difficultyMatch = true;
        if (filters.difficulty) {
          const qDifficulty = (q.difficulty || '').trim().toLowerCase();
          const filterDifficulty = (filters.difficulty || '').trim().toLowerCase();
          difficultyMatch = qDifficulty === filterDifficulty;
        }
        
        return categoryMatch && difficultyMatch;
      });
      
      console.log(`✅ Strict validation: ${strictMatches.length} exact matches`);
      
      // If no questions match, return empty array
      if (strictMatches.length === 0) {
        console.log(`⚠️ No questions found for category="${filters.category}" and difficulty="${filters.difficulty}"`);
        return [];
      }
      
      // Shuffle and return ONLY questions from the specified category
      const shuffled = this.enhancedShuffle([...strictMatches]);
      const selected = shuffled.slice(0, Math.min(filters.count, shuffled.length));
      
      console.log(`✅ Returning ${selected.length} questions (requested ${filters.count})`);
      return selected;
    }
    
    // No category filter - get all questions or filtered by difficulty only
    const allQuestions = await this.getQuestions({
      difficulty: filters.difficulty
    });
    
    if (allQuestions.length === 0) {
      return [];
    }
    
    console.log(`📊 Total questions available: ${allQuestions.length}`);
    
    const shuffled = this.enhancedShuffle([...allQuestions]);
    const selected = shuffled.slice(0, Math.min(filters.count, shuffled.length));
    
    return selected;
  }

  /**
   * Memory-based random selection (original algorithm)
   * Used for small datasets or as fallback
   */
  private async memoryBasedRandomSelection(filters: { category?: string; difficulty?: string; count: number }): Promise<Question[]> {
    // Get all questions from database
    const allQuestions = await this.getQuestions({});
    
    if (allQuestions.length === 0) {
      return [];
    }
    
    // Apply filters to get primary candidates
    let primaryCandidates: Question[] = [];
    let secondaryCandidates: Question[] = [];
    
    if (filters.category && filters.category !== "All Categories") {
      primaryCandidates = allQuestions.filter(q => q.category === filters.category);
      
      if (filters.difficulty) {
        primaryCandidates = primaryCandidates.filter(q => q.difficulty === filters.difficulty);
      }
      
      if (filters.difficulty) {
        secondaryCandidates = allQuestions.filter(q => 
          q.difficulty === filters.difficulty && q.category !== filters.category
        );
      } else {
        secondaryCandidates = allQuestions.filter(q => q.category !== filters.category);
      }
    } else if (filters.difficulty) {
      primaryCandidates = allQuestions.filter(q => q.difficulty === filters.difficulty);
      secondaryCandidates = allQuestions.filter(q => q.difficulty !== filters.difficulty);
    } else {
      primaryCandidates = allQuestions;
    }
    
    return this.weightedRandomSelection(primaryCandidates, secondaryCandidates, filters.count);
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
    const primaryTarget = Math.min(Math.ceil(count * 0.7), shuffledPrimary.length);
    for (let i = 0; i < primaryTarget && selectedQuestions.length < count; i++) {
      const question = shuffledPrimary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(`✅ Selected ${selectedQuestions.length} questions from primary candidates`);
    
    // Step 3: Fill from secondary candidates (up to 20% of target)
    const secondaryTarget = Math.min(Math.ceil(count * 0.2), shuffledSecondary.length);
    for (let i = 0; i < secondaryTarget && selectedQuestions.length < count; i++) {
      const question = shuffledSecondary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(`✅ Selected ${selectedQuestions.length} questions from secondary candidates`);
    
    // Step 4: Fill remaining slots from tertiary candidates
    for (let i = 0; i < shuffledTertiary.length && selectedQuestions.length < count; i++) {
      const question = shuffledTertiary[i];
      if (!usedIds.has(question.id)) {
        selectedQuestions.push(question);
        usedIds.add(question.id);
      }
    }
    console.log(`✅ Selected ${selectedQuestions.length} questions from tertiary candidates`);
    
    // Step 5: If we still need more questions, fill from any remaining candidates
    if (selectedQuestions.length < count) {
      const allCandidates = [...shuffledPrimary, ...shuffledSecondary, ...shuffledTertiary];
      for (let i = 0; i < allCandidates.length && selectedQuestions.length < count; i++) {
        const question = allCandidates[i];
        if (!usedIds.has(question.id)) {
          selectedQuestions.push(question);
          usedIds.add(question.id);
        }
      }
    }
    
    // Step 6: Final enhanced shuffle for maximum randomness
    const finalShuffle = this.enhancedShuffle(selectedQuestions);
    
    console.log(`🎲 Final selection: ${finalShuffle.length} questions with ${new Set(finalShuffle.map((q: Question) => q.category)).size} categories`);
    console.log(`✅ Guaranteed count achieved: ${finalShuffle.length}/${count}`);
    
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
      Math.max(0, primaryCandidates.length + secondaryCandidates.length - primaryCount - secondaryCount)
    );
    
    console.log(`📊 Selection breakdown: ${primaryCount} primary, ${secondaryCount} secondary, ${tertiaryCount} tertiary`);
    
    // Step 1: Select from primary candidates (filtered questions)
    if (primaryCandidates.length > 0) {
      const shuffledPrimary = this.enhancedShuffle([...primaryCandidates]);
      selectedQuestions.push(...shuffledPrimary.slice(0, primaryCount));
      console.log(`✅ Selected ${primaryCount} questions from primary candidates`);
    }
    
    // Step 2: Select from secondary candidates (other questions)
    if (secondaryCandidates.length > 0 && secondaryCount > 0) {
      const shuffledSecondary = this.enhancedShuffle([...secondaryCandidates]);
      selectedQuestions.push(...shuffledSecondary.slice(0, secondaryCount));
      console.log(`✅ Selected ${secondaryCount} questions from secondary candidates`);
    }
    
    // Step 3: Select from tertiary candidates (remaining questions)
    if (tertiaryCount > 0) {
      const allRemaining = [...primaryCandidates, ...secondaryCandidates];
      const usedIds = new Set(selectedQuestions.map((q: Question) => q.id));
      const unusedQuestions = allRemaining.filter((q: Question) => !usedIds.has(q.id));
      
      if (unusedQuestions.length > 0) {
        const shuffledTertiary = this.enhancedShuffle(unusedQuestions);
        selectedQuestions.push(...shuffledTertiary.slice(0, tertiaryCount));
        console.log(`✅ Selected ${Math.min(tertiaryCount, unusedQuestions.length)} questions from tertiary candidates`);
      }
    }
    
    // Step 4: Enhanced final shuffle to randomize the order
    const finalShuffle = this.enhancedShuffle(selectedQuestions);
    
    console.log(`🎲 Final selection: ${finalShuffle.length} questions with ${new Set(finalShuffle.map((q: Question) => q.category)).size} categories`);
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
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Generate random index from 0 to i (inclusive)
      const j = Math.floor(Math.random() * (i + 1));
      
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
      answers: shuffledAnswers
    };
  }

  /**
   * Shuffle both questions and answers for each question
   * This ensures variety in both question order and answer positions
   */
  private shuffleQuestionsAndAnswers(questions: Question[]): Question[] {
    if (!questions || questions.length === 0) {
      return questions;
    }

    // Generate a base seed for consistent shuffling
    const baseSeed = Date.now();
    
    // First shuffle the questions themselves
    const shuffledQuestions = this.stableShuffle(questions, baseSeed);
    
    // Then shuffle answers for each question with different seeds
    return shuffledQuestions.map((question, index) => {
      // Use different seed for each question's answers
      const answerSeed = baseSeed + index * 1000 + question.id.charCodeAt(0);
      return this.shuffleQuestionAnswers(question, answerSeed);
    });
  }

  // Game result methods
  async saveGameResult(result: GameResult): Promise<GameResult> {
    const dbResult = await db.insert(gameResults).values({
      id: result.id,
      playerName: result.playerName,
      score: result.score,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      averageTime: result.averageTime,
      category: result.category,
      difficulty: result.difficulty,
      timestamp: new Date(result.timestamp)
    }).returning();
    
    // Convert back to the expected format
    const dbGameResult = dbResult[0];
    return {
      ...dbGameResult,
      timestamp: dbGameResult.timestamp?.toISOString() || new Date().toISOString()
    } as GameResult;
  }

  async getGameResults(): Promise<GameResult[]> {
    const results = await db.select().from(gameResults).orderBy(desc(gameResults.timestamp));
    return results.map(result => ({
      ...result,
      timestamp: result.timestamp?.toISOString() || new Date().toISOString()
    })) as GameResult[];
  }

  // Single player score methods
  async saveSinglePlayerScore(score: InsertSinglePlayerScore): Promise<any> {
    const result = await db.insert(singlePlayerScores).values(score).returning();
    return result[0];
  }

  async getSinglePlayerScores(filters?: { userId?: number; category?: string; difficulty?: string; gameType?: string }): Promise<any[]> {
    try {
      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;
      
      if (filters?.userId) {
        whereClause += ` WHERE user_id = $${paramIndex}`;
        params.push(filters.userId);
        paramIndex++;
      }
      if (filters?.category) {
        whereClause += whereClause ? ` AND category = $${paramIndex}` : ` WHERE category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }
      if (filters?.difficulty) {
        whereClause += whereClause ? ` AND difficulty = $${paramIndex}` : ` WHERE difficulty = $${paramIndex}`;
        params.push(filters.difficulty);
        paramIndex++;
      }
      if (filters?.gameType) {
        whereClause += whereClause ? ` AND game_type = $${paramIndex}` : ` WHERE game_type = $${paramIndex}`;
        params.push(filters.gameType);
        paramIndex++;
      }
      
      const sql = `SELECT * FROM single_player_scores${whereClause} ORDER BY score DESC`;
      console.log('SQL Query:', sql, 'Params:', params);
      
      // Use the postgres client directly for parameterized queries
      const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
      const result = await client.unsafe(sql, params);
      await client.end();
      
      console.log('Raw single player scores result:', result);
      return result;
    } catch (error) {
      console.error('Error in getSinglePlayerScores:', error);
      return [];
    }
  }

  // Multiplayer score methods
  async saveMultiplayerScore(score: any): Promise<any> {
    try {
      const result = await db.insert(multiplayerScores).values({
        id: score.id || `multi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        timestamp: new Date()
      }).returning();
      
      return result[0];
    } catch (error) {
      console.error('Error saving multiplayer score:', error);
      throw error;
    }
  }

  async getMultiplayerScores(filters?: { gameSessionId?: string; playerName?: string; category?: string; difficulty?: string }): Promise<any[]> {
    try {
      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;
      
      if (filters?.gameSessionId) {
        whereClause += ` WHERE game_session_id = $${paramIndex}`;
        params.push(filters.gameSessionId);
        paramIndex++;
      }
      if (filters?.playerName) {
        whereClause += whereClause ? ` AND player_name = $${paramIndex}` : ` WHERE player_name = $${paramIndex}`;
        params.push(filters.playerName);
        paramIndex++;
      }
      if (filters?.category) {
        whereClause += whereClause ? ` AND category = $${paramIndex}` : ` WHERE category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }
      if (filters?.difficulty) {
        whereClause += whereClause ? ` AND difficulty = $${paramIndex}` : ` WHERE difficulty = $${paramIndex}`;
        params.push(filters.difficulty);
        paramIndex++;
      }
      
      const sql = `SELECT * FROM multiplayer_scores${whereClause} ORDER BY score DESC`;
      console.log('SQL Query:', sql, 'Params:', params);
      
      // Use the postgres client directly for parameterized queries
      const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
      const result = await client.unsafe(sql, params);
      await client.end();
      
      console.log('Raw multiplayer scores result:', result);
      return result;
    } catch (error) {
      console.error('Error in getMultiplayerScores:', error);
      return [];
    }
  }

  async getMultiplayerLeaderboardData(category?: string, difficulty?: string): Promise<any[]> {
    try {
      // Use direct SQL query to get aggregated multiplayer scores
      const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
      
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
      if (category && category !== 'All Categories') {
        sql += ` WHERE category = '${category}'`;
      }
      
      // Add difficulty filter if specified
      if (difficulty && difficulty !== 'All Difficulties') {
        sql += category && category !== 'All Categories' ? ` AND difficulty = '${difficulty}'` : ` WHERE difficulty = '${difficulty}'`;
      }
      
      sql += `
        GROUP BY player_name
        ORDER BY MAX(score) DESC
      `;
      
      const multiplayerResults = await client.unsafe(sql);
      await client.end();
      
      console.log('Multiplayer aggregated results:', multiplayerResults);
      
      const multiplayerLeaderboard = multiplayerResults.map(result => ({
        id: result.name, // Use player name as ID for multiplayer
        name: result.name,
        score: result.score,
        gamesPlayed: parseInt(result.games_played),
        correctAnswers: parseInt(result.total_correct_answers),
        incorrectAnswers: parseInt(result.total_incorrect_answers),
        accuracy: Math.round((result.total_correct_answers / (result.total_correct_answers + result.total_incorrect_answers)) * 100) || 0,
        avgTime: parseFloat(result.avg_time) || 0,
        category: result.category,
        difficulty: result.difficulty,
        timestamp: result.timestamp
      }));
      
      return multiplayerLeaderboard;
    } catch (error) {
      console.error('Error in getMultiplayerLeaderboardData:', error);
      return [];
    }
  }

  async getLeaderboardData(gameType?: string, category?: string): Promise<any[]> {
    try {
      let leaderboardData = [];
      
      if (gameType === 'single' || gameType === 'all') {
        // Use direct SQL query to get aggregated single player scores
        const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
        
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
        if (category && category !== 'All Categories') {
          sql += ` WHERE category = '${category}'`;
        }
        
        sql += `
          GROUP BY user_id, player_name
          ORDER BY MAX(score) DESC
        `;
        
        const singlePlayerResults = await client.unsafe(sql);
        await client.end();
        
        console.log('Single player aggregated results:', singlePlayerResults);
        
        const singlePlayerLeaderboard = singlePlayerResults.map(result => ({
          id: result.id.toString(),
          name: result.name,
          score: result.score,
          gamesPlayed: parseInt(result.games_played),
          correctAnswers: parseInt(result.total_correct_answers),
          incorrectAnswers: parseInt(result.total_incorrect_answers),
          accuracy: Math.round((result.total_correct_answers / (result.total_correct_answers + result.total_incorrect_answers)) * 100) || 0,
          averageTime: Math.round(parseFloat(result.avg_time) * 100) / 100,
          gameType: 'single',
          category: result.category,
          difficulty: result.difficulty,
          timestamp: result.timestamp
        }));
        
        leaderboardData.push(...singlePlayerLeaderboard);
      }
      
      if (gameType === 'multi' || gameType === 'all') {
        // Get multiplayer scores from the multiplayer_scores table
        const client = postgres("postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
        
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
        
        if (category && category !== 'All Categories') {
          conditions.push(`category = $${paramIndex}`);
          params.push(category);
          paramIndex++;
        }
        
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        sql += `
          GROUP BY player_name
          ORDER BY MAX(score) DESC, COUNT(*) DESC
        `;
        
        const multiplayerResults = await client.unsafe(sql, params);
        await client.end();
        
        console.log('Multiplayer aggregated results:', multiplayerResults);
        
        const multiplayerLeaderboard = multiplayerResults.map(result => ({
          id: result.name, // Use player name as ID for multiplayer
          name: result.name,
          score: parseInt(result.best_score),
          gamesPlayed: parseInt(result.games_played),
          correctAnswers: parseInt(result.total_correct_answers),
          incorrectAnswers: parseInt(result.total_incorrect_answers),
          accuracy: Math.round((result.total_correct_answers / (result.total_correct_answers + result.total_incorrect_answers)) * 100) || 0,
          averageTime: Math.round(parseFloat(result.avg_time) * 100) / 100,
          gameType: result.game_type || 'multi',
          category: result.category,
          difficulty: result.difficulty,
          timestamp: result.last_played
        }));
        
        leaderboardData.push(...multiplayerLeaderboard);
      }
      
      console.log('All leaderboard data:', leaderboardData);
      
      // Combine and deduplicate users to show only their best score
      const userBestScores = new Map();
      
      leaderboardData.forEach(entry => {
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
            incorrectAnswers: existingEntry.incorrectAnswers + entry.incorrectAnswers,
          });
        } else {
          // Keep the existing better score but add to total games and stats
          existingEntry.gamesPlayed += entry.gamesPlayed;
          existingEntry.correctAnswers += entry.correctAnswers;
          existingEntry.incorrectAnswers += entry.incorrectAnswers;
        }
      });
      
      // Convert back to array and recalculate accuracy
      const finalLeaderboard = Array.from(userBestScores.values()).map(entry => ({
        ...entry,
        accuracy: Math.round((entry.correctAnswers / (entry.correctAnswers + entry.incorrectAnswers)) * 100) || 0
      }));
      
      // Sort by score descending, then by games played (for tie-breakers)
      return finalLeaderboard.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // If scores are equal, sort by games played (more games = higher rank)
        return b.gamesPlayed - a.gamesPlayed;
      });
    } catch (error) {
      console.error('Error in getLeaderboardData:', error);
      return [];
    }
  }

  // Game session methods
  async getGameSession(id: string): Promise<GameSession | undefined> {
    const result = await db.select().from(gameSessions).where(eq(gameSessions.id, id));
    return result[0] as GameSession | undefined;
  }

  async createGameSession(session: GameSession): Promise<GameSession> {
    const result = await db.insert(gameSessions).values({
      id: session.id,
      players: session.players,
      currentQuestion: session.currentQuestion,
      gameType: session.gameType,
      category: session.category,
      difficulty: session.difficulty,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status
    }).returning();
    return result[0] as GameSession;
  }

  async updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession> {
    await db.update(gameSessions).set(updates).where(eq(gameSessions.id, id));
    const updated = await this.getGameSession(id);
    if (!updated) throw new Error(`Game session with id ${id} not found`);
    return updated;
  }

  // Challenge methods
  async getChallenge(id: string): Promise<Challenge | undefined> {
    const result = await db.select().from(challenges).where(eq(challenges.id, id));
    return result[0] as Challenge | undefined;
  }

  async getChallengesByUser(userId: number, status?: string): Promise<Challenge[]> {
    let conditions = [
      or(
        eq(challenges.challengerId, userId),
        eq(challenges.challengeeId, userId)
      )
    ];
    
    if (status) {
      conditions.push(eq(challenges.status, status as any));
    }
    
    const result = await db.select().from(challenges).where(and(...conditions));
    return result as Challenge[];
  }

  async createChallenge(challenge: Challenge): Promise<Challenge> {
    const result = await db.insert(challenges).values({
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
      notificationSent: challenge.notificationSent
    }).returning();
    return result[0] as Challenge;
  }

  async updateChallenge(id: string, updates: Partial<Challenge>): Promise<Challenge> {
    await db.update(challenges).set(updates).where(eq(challenges.id, id));
    const updated = await this.getChallenge(id);
    if (!updated) throw new Error(`Challenge with id ${id} not found`);
    return updated;
  }

  // Challenge result methods
  async getChallengeResult(id: string): Promise<ChallengeResult | undefined> {
    const result = await db.select().from(challengeResults).where(eq(challengeResults.id, id));
    return result[0] as ChallengeResult | undefined;
  }

  async getChallengeResultsByChallenge(challengeId: string): Promise<ChallengeResult[]> {
    const result = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, challengeId));
    return result as ChallengeResult[];
  }

  async createChallengeResult(result: ChallengeResult): Promise<ChallengeResult> {
    const dbResult = await db.insert(challengeResults).values({
      id: result.id,
      challengeId: result.challengeId,
      userId: result.userId,
      score: result.score,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      averageTime: result.averageTime,
      completedAt: result.completedAt,
      answers: result.answers
    }).returning();
    return dbResult[0] as ChallengeResult;
  }

  async updateChallengeResult(id: string, updates: Partial<ChallengeResult>): Promise<ChallengeResult> {
    await db.update(challengeResults).set(updates).where(eq(challengeResults.id, id));
    const updated = await this.getChallengeResult(id);
    if (!updated) throw new Error(`Challenge result with id ${id} not found`);
    return updated;
  }

  // Notification methods
  async getNotifications(userId: number, read?: boolean): Promise<Notification[]> {
    let conditions = [eq(notifications.userId, userId)];
    
    if (read !== undefined) {
      conditions.push(eq(notifications.read, read));
    }
    
    const result = await db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt));
    return result as Notification[];
  }

  async createNotification(notification: Notification): Promise<Notification> {
    const result = await db.insert(notifications).values({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      message: notification.message,
      read: notification.read,
      challengeId: notification.challengeId,
      createdAt: notification.createdAt
    }).returning();
    return result[0] as Notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    const updated = await db.select().from(notifications).where(eq(notifications.id, id));
    if (!updated[0]) throw new Error(`Notification with id ${id} not found`);
    return updated[0] as Notification;
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Online user methods
  async getOnlineUsers(): Promise<User[]> {
    const result = await db.select().from(users).where(eq(users.isOnline, true));
    return result as User[];
  }

  async setUserOnline(userId: number, isOnline: boolean): Promise<User> {
    await db.update(users).set({ 
      isOnline, 
      lastSeen: new Date() 
    }).where(eq(users.id, userId));
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
    const result = await db.select().from(teams).where(eq(teams.gameSessionId, gameSessionId));
    return result as Team[];
  }

  async createTeam(team: Team): Promise<Team> {
    const result = await db.insert(teams).values({
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
      createdAt: team.createdAt
    }).returning();
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
    const result = await db.select().from(teamInvitations).where(eq(teamInvitations.id, id));
    return result[0] as TeamInvitation | undefined;
  }

  async getTeamInvitationsByUser(userId: number, status?: string): Promise<TeamInvitation[]> {
    let conditions = [eq(teamInvitations.inviteeId, userId)];
    
    if (status) {
      conditions.push(eq(teamInvitations.status, status as any));
    }
    
    const result = await db.select().from(teamInvitations).where(and(...conditions));
    return result as TeamInvitation[];
  }

  async createTeamInvitation(invitation: TeamInvitation): Promise<TeamInvitation> {
    const result = await db.insert(teamInvitations).values({
      id: invitation.id,
      teamId: invitation.teamId,
      inviterId: invitation.inviterId,
      inviteeId: invitation.inviteeId,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt
    }).returning();
    return result[0] as TeamInvitation;
  }

  async updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    await db.update(teamInvitations).set(updates).where(eq(teamInvitations.id, id));
    const updated = await this.getTeamInvitation(id);
    if (!updated) throw new Error(`Team invitation with id ${id} not found`);
    return updated;
  }

  async deleteTeamInvitation(id: string): Promise<void> {
    await db.delete(teamInvitations).where(eq(teamInvitations.id, id));
  }

  // Voice settings methods
  async getVoiceCloneId(): Promise<string | null> {
    try {
      const result = await db.select().from(voiceSettings).where(eq(voiceSettings.id, "default"));
      const settings = result[0];
      return settings?.elevenlabsVoiceId || null;
    } catch (error) {
      console.error("Error getting voice clone ID:", error);
      return null;
    }
  }

  async setVoiceCloneId(voiceId: string | null): Promise<void> {
    try {
      const existing = await db.select().from(voiceSettings).where(eq(voiceSettings.id, "default"));
      
      if (existing.length > 0) {
        await db.update(voiceSettings)
          .set({ 
            elevenlabsVoiceId: voiceId,
            updatedAt: new Date()
          })
          .where(eq(voiceSettings.id, "default"));
      } else {
        await db.insert(voiceSettings).values({
          id: "default",
          elevenlabsVoiceId: voiceId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error("Error setting voice clone ID:", error);
      throw error;
    }
  }

  async getVoiceSettings(): Promise<VoiceSettings | undefined> {
    try {
      const result = await db.select().from(voiceSettings).where(eq(voiceSettings.id, "default"));
      return result[0] as VoiceSettings | undefined;
    } catch (error) {
      console.error("Error getting voice settings:", error);
      return undefined;
    }
  }

  async updateVoiceSettings(updates: Partial<VoiceSettings>): Promise<VoiceSettings> {
    try {
      const existing = await db.select().from(voiceSettings).where(eq(voiceSettings.id, "default"));
      
      if (existing.length > 0) {
        await db.update(voiceSettings)
          .set({ 
            ...updates,
            updatedAt: new Date()
          })
          .where(eq(voiceSettings.id, "default"));
      } else {
        await db.insert(voiceSettings).values({
          id: "default",
          ...updates,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
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
      const result = await db.insert(voiceUsage).values({
        id: crypto.randomUUID(),
        voiceId: usage.voiceId,
        textLength: usage.textLength,
        estimatedCredits: usage.estimatedCredits,
        requestType: usage.requestType,
        gameSessionId: usage.gameSessionId,
        userId: usage.userId,
        createdAt: new Date()
      }).returning();
      
      return result[0] as VoiceUsage;
    } catch (error) {
      console.error("Error tracking voice usage:", error);
      throw error;
    }
  }

  async getVoiceUsageStats(timeframe: 'day' | 'week' | 'month' = 'month'): Promise<{
    totalRequests: number;
    totalCharacters: number;
    estimatedCredits: number;
    requestsByType: Record<string, number>;
  }> {
    try {
      const now = new Date();
      let startDate: Date;
      
      switch (timeframe) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const usage = await db.select().from(voiceUsage)
        .where(gte(voiceUsage.createdAt, startDate));

      const totalRequests = usage.length;
      const totalCharacters = usage.reduce((sum, u) => sum + u.textLength, 0);
      const estimatedCredits = usage.reduce((sum, u) => sum + u.estimatedCredits, 0);
      
      const requestsByType: Record<string, number> = {};
      usage.forEach(u => {
        requestsByType[u.requestType] = (requestsByType[u.requestType] || 0) + 1;
      });

      return {
        totalRequests,
        totalCharacters,
        estimatedCredits,
        requestsByType
      };
    } catch (error) {
      console.error("Error getting voice usage stats:", error);
      return {
        totalRequests: 0,
        totalCharacters: 0,
        estimatedCredits: 0,
        requestsByType: {}
      };
    }
  }

  async clearAllTeamStatuses(): Promise<void> {
    // Reset all teams to forming status in database
    await db.update(teams).set({ status: 'forming' });
    // Clear all invitations in database
    await db.delete(teamInvitations);
  }

  // Initialize database with sample data
  async initializeDatabase(): Promise<void> {
    try {
      console.log("Initializing PostgreSQL database with sample data...");
      
      // Create initial admin user if it doesn't exist
      const adminUser = await this.getUserByUsername("admin");
      if (!adminUser) {
        const { hashPassword } = await import("./auth");
        await this.createUser({
          username: "admin",
          password: await hashPassword("admin123"),
          isAdmin: true
        });
        console.log("Created initial admin user: admin / admin123");
      }

      // Create some sample users for testing
      const sampleUsers = [
        { username: "john_doe", password: "password123", email: "john@example.com" },
        { username: "jane_smith", password: "password123", email: "jane@example.com" },
        { username: "bob_wilson", password: "password123", email: "bob@example.com" },
        { username: "alice_brown", password: "password123", email: "alice@example.com" }
      ];

      for (const sampleUser of sampleUsers) {
        const existingUser = await this.getUserByUsername(sampleUser.username);
        if (!existingUser) {
          const { hashPassword } = await import("./auth");
          await this.createUser({
            username: sampleUser.username,
            password: await hashPassword(sampleUser.password),
            email: sampleUser.email,
            isAdmin: false
          });
          console.log(`Created sample user: ${sampleUser.username} / ${sampleUser.password}`);
        }
      }
      
      console.log("PostgreSQL database initialization completed!");
    } catch (error) {
      console.error("Error initializing PostgreSQL database:", error);
      throw error;
    }
  }
}

// Export the database instance
export const database = new PostgreSQLDatabase(); 