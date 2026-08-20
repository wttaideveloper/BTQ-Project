import { adminFetch, apiRequest } from './queryClient';

// Fetch a list of questions
export async function fetchQuestions(
  category: string = 'All Categories',
  difficulty: string = 'All Difficulties',
  searchQuery: string = ''
): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (category !== 'All Categories') params.append('category', category);
    if (
      difficulty &&
      difficulty !== 'All' &&
      difficulty !== 'All Difficulties'
    ) {
      params.append('difficulty', difficulty);
    }
    if (searchQuery) params.append('search', searchQuery);
    
    const res = await adminFetch(`/api/questions?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(text || 'Failed to fetch questions');
    }
    return await res.json();
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    throw error;
  }
}

// Create a new question
export async function createQuestion(questionData: any): Promise<any> {
  try {
    const res = await apiRequest('POST', '/api/questions', questionData);
    return await res.json();
  } catch (error) {
    console.error('Failed to create question:', error);
    throw error;
  }
}

// Update an existing question
export async function updateQuestion({ id, question }: { id: string, question: any }): Promise<any> {
  try {
    const res = await apiRequest('PUT', `/api/questions/${id}`, question);
    return await res.json();
  } catch (error) {
    console.error('Failed to update question:', error);
    throw error;
  }
}

// Delete a question
export async function deleteQuestion(id: string): Promise<void> {
  try {
    await apiRequest('DELETE', `/api/questions/${id}`, undefined);
  } catch (error) {
    console.error('Failed to delete question:', error);
    throw error;
  }
}

// Generate questions using AI
export async function generateQuestionsAI(params: {
  category: string;
  difficulty: string;
  count: number;
}): Promise<any[]> {
  try {
    const res = await apiRequest('POST', '/api/questions/generate', params);
    return await res.json();
  } catch (error) {
    console.error('Failed to generate questions:', error);
    throw error;
  }
}

// Submit a player's game results
export async function submitGameResults(results: {
  playerName: string;
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  category: string;
  difficulty: string;
}): Promise<any> {
  try {
    const res = await apiRequest('POST', '/api/game/results', results);
    return await res.json();
  } catch (error) {
    console.error('Failed to submit game results:', error);
    throw error;
  }
}

// Get a set of questions for a game
export async function getGameQuestions(
  category: string = 'All Categories',
  difficulty: string = 'Beginner',
  count: number = 10,
  gameId?: string,
  excludeIds?: string[]
): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (category !== 'All Categories') params.append('category', category);
    if (difficulty !== 'All') params.append('difficulty', difficulty);
    params.append('count', count.toString());
    
    if (gameId) {
      params.append('gameId', gameId);
    }

    if (excludeIds && excludeIds.length > 0) {
      params.append('excludeIds', excludeIds.join(','));
    }
    
    const res = await apiRequest('GET', `/api/game/questions?${params.toString()}`, undefined);
    return await res.json();
  } catch (error) {
    console.error('Failed to get game questions:', error);
    throw error;
  }
}

// Count questions still available for the current game session
export async function getRemainingQuestionCount(
  category: string = 'All Categories',
  difficulty: string = 'Beginner',
  excludeIds: string[] = [],
  gameId?: string
): Promise<number> {
  try {
    const params = new URLSearchParams();
    if (category !== 'All Categories') params.append('category', category);
    if (difficulty !== 'All') params.append('difficulty', difficulty);
    if (excludeIds.length > 0) {
      params.append('excludeIds', excludeIds.join(','));
    }
    if (gameId) {
      params.append('gameId', gameId);
    }

    const res = await apiRequest(
      'GET',
      `/api/game/questions/remaining-count?${params.toString()}`,
      undefined
    );
    const data = await res.json();
    return typeof data.count === 'number' ? data.count : 0;
  } catch (error) {
    console.error('Failed to get remaining question count:', error);
    return 0;
  }
}
