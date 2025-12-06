import { v4 as uuidv4 } from "uuid";
import { Question, Answer } from "@shared/schema";
import { database } from "./database";

// Types for question validation workflow
export interface QuestionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface QuestionEditRequest {
  text?: string;
  context?: string;
  category?: string;
  difficulty?: string;
  answers?: Answer[];
}

// Question validation service
export class QuestionValidationService {
  
  // Validate a single question
  static validateQuestion(question: Question): QuestionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Required field validation
    if (!question.text || question.text.trim().length === 0) {
      errors.push("Question text is required");
    } else if (question.text.trim().length < 10) {
      warnings.push("Question text seems too short");
    }

    if (!question.category || question.category.trim().length === 0) {
      errors.push("Category is required");
    } else {
      // Validate category without changing it
      const validCategories = ["Old Testament", "New Testament", "Bible Stories", "Famous People", "Theme-Based"];
      const normalizedCategory = question.category.toLowerCase();
      const isValidCategory = validCategories.some(c => c.toLowerCase() === normalizedCategory);
      
      if (!isValidCategory) {
        errors.push(`Category must be one of: ${validCategories.join(", ")}`);
      }
    }

    if (!question.difficulty || question.difficulty.trim().length === 0) {
      errors.push("Difficulty is required");
    }

    // Validate difficulty levels - use exact values from AdminPanel
    const validDifficulties = ["Beginner", "Intermediate", "Advanced"];
    const normalizedDifficulty = question.difficulty?.toLowerCase();
    const isValidDifficulty = validDifficulties.some(d => d.toLowerCase() === normalizedDifficulty);
    
    if (!isValidDifficulty) {
      errors.push(`Difficulty must be one of: ${validDifficulties.join(", ")}`);
    }

    // Answer validation
    if (!question.answers || !Array.isArray(question.answers)) {
      errors.push("Question must have answers array");
    } else {
      if (question.answers.length !== 4) {
        errors.push("Question must have exactly 4 answers");
      }

      let correctCount = 0;
      const answerTexts = new Set<string>();

      question.answers.forEach((answer, index) => {
        if (!answer.text || answer.text.trim().length === 0) {
          errors.push(`Answer ${index + 1} text is required`);
        } else {
          const trimmedText = answer.text.trim();
          if (answerTexts.has(trimmedText)) {
            errors.push(`Duplicate answer text: "${trimmedText}"`);
          }
          answerTexts.add(trimmedText);
        }

        if (answer.isCorrect) {
          correctCount++;
        }
      });

      if (correctCount !== 1) {
        errors.push("Question must have exactly one correct answer");
      }

      if (answerTexts.size < 4) {
        warnings.push("Some answers are identical");
      }
    }

    // Content quality checks
    if (question.text && question.text.length > 200) {
      warnings.push("Question text is quite long");
    }

    if (question.context && question.context.length > 300) {
      warnings.push("Context is quite long");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  // Validate multiple questions
  static validateQuestions(questions: Question[]): QuestionValidationResult[] {
    return questions.map(question => this.validateQuestion(question));
  }

  // Check for duplicate questions
  static async checkForDuplicates(question: Question): Promise<string[]> {
    const duplicates: string[] = [];
    
    try {
      const existingQuestions = await database.getQuestions({ 
        search: question.text.substring(0, 50) 
      });
      
      for (const existing of existingQuestions) {
        const similarity = this.calculateSimilarity(question.text, existing.text);
        if (similarity > 0.8) {
          duplicates.push(`Similar to existing question: "${existing.text.substring(0, 100)}..."`);
        }
      }
    } catch (error) {
      console.error("Error checking for duplicates:", error);
    }
    
    return duplicates;
  }

  // Calculate text similarity (simple implementation)
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
    const union = new Set(Array.from(words1).concat(Array.from(words2)));
    
    return intersection.size / union.size;
  }

  // Store questions in database - NO BACKEND VALIDATION
  static async storeValidatedQuestions(questions: Question[]): Promise<Question[]> {
    const storedQuestions: Question[] = [];
    
    for (const question of questions) {
      try {
        console.log(`Storing question: ${question.text?.substring(0, 50)}...`);
        
        // Store directly without any validation
        const storedQuestion = await database.createQuestion(question);
        storedQuestions.push(storedQuestion);
        
        console.log(`✅ Successfully stored question with ID: ${storedQuestion.id}`);
      } catch (error) {
        console.error(`❌ Failed to store question: ${question.text.substring(0, 50)}...`, error);
        // Continue with other questions even if one fails
      }
    }
    
    return storedQuestions;
  }

  // Edit a question
  static editQuestion(question: Question, edits: QuestionEditRequest): Question {
    const editedQuestion: Question = {
      ...question,
      ...edits,
      id: question.id || uuidv4(),
      answers: edits.answers || question.answers
    };

    // Validate the edited question
    const validation = this.validateQuestion(editedQuestion);
    if (!validation.isValid) {
      throw new Error(`Question validation failed: ${validation.errors.join(", ")}`);
    }

    return editedQuestion;
  }
} 