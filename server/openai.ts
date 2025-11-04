import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { Question } from "@shared/schema";
import { database } from "./database";
import { QuestionValidationService } from "./question-validation";

// Initialize OpenAI client with API key from environment
// IMPORTANT: Set OPENAI_API_KEY in your .env file or environment variables
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY not found in environment variables. OpenAI features will not work.");
}
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Check if a question already exists in the database
async function questionExists(text: string): Promise<boolean> {
  try {
    const existingQuestions = await database.getQuestions({ search: text });
    return existingQuestions.some(q => 
      q.text.toLowerCase().trim() === text.toLowerCase().trim()
    );
  } catch (error) {
    console.error("Error checking for existing questions:", error);
    return false;
  }
}

// Generate trivia questions using OpenAI
export async function generateQuestions(
  category: string,
  difficulty: string,
  count: number
): Promise<Question[]> {
  try {
    console.log(`Generating ${count} questions for category: ${category}, difficulty: ${difficulty}`);
    
    const prompt = `
      Create exactly ${count} Bible trivia questions for a Christian trivia game.
      Category: ${category}
      Difficulty: ${difficulty}
      
      Requirements:
      1. Each question must be about the Bible and accurate
      2. Include 4 multiple choice answers (A, B, C, D)
      3. Exactly ONE answer must be correct per question
      4. Questions should match the specified difficulty level
      5. Include relevant context when helpful
      6. Make questions unique and varied
      
      You MUST return a JSON array with exactly ${count} questions using this exact structure:
      {
        "questions": [
          {
            "text": "What was the name of the first man created by God?",
            "context": "This is mentioned in the first book of the Bible",
            "category": "${category}",
            "difficulty": "${difficulty}",
            "answers": [
              {"text": "Adam", "isCorrect": true},
              {"text": "Eve", "isCorrect": false},
              {"text": "Noah", "isCorrect": false},
              {"text": "Moses", "isCorrect": false}
            ]
          },
          {
            "text": "Who built the ark according to the Bible?",
            "context": "This person was chosen by God to save animals from a great flood",
            "category": "${category}",
            "difficulty": "${difficulty}",
            "answers": [
              {"text": "Abraham", "isCorrect": false},
              {"text": "Moses", "isCorrect": false},
              {"text": "Noah", "isCorrect": true},
              {"text": "David", "isCorrect": false}
            ]
          }
        ]
      }
      
      CRITICAL: 
      - Return ONLY the JSON object with a "questions" array
      - Ensure the JSON is valid and parseable
      - Exactly one answer per question must be marked as correct
      - Return exactly ${count} questions, no more, no less
      - Make questions unique and different from common Bible trivia
    `;

    console.log("Sending request to OpenAI...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    console.log("Parsing OpenAI response...");
    console.log("Raw response:", content);
    
    // Parse the response and handle different response formats
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.log("Raw response:", content);
      throw new Error("Invalid JSON response from OpenAI");
    }

    // Extract questions from different possible response formats
    let questions = [];
    
    // Handle different response structures
    if (parsedContent.questions && Array.isArray(parsedContent.questions)) {
      questions = parsedContent.questions;
    } else if (Array.isArray(parsedContent)) {
      questions = parsedContent;
    } else if (parsedContent.data && Array.isArray(parsedContent.data)) {
      questions = parsedContent.data;
    } else if (parsedContent.text && parsedContent.answers) {
      // Handle single question response
      questions = [parsedContent];
    } else {
      console.error("Unexpected response format:", parsedContent);
      throw new Error("Unexpected response format from OpenAI");
    }

    console.log(`Successfully parsed ${questions.length} questions`);

    // Validate and format questions
    const formattedQuestions = questions.map((q: any, index: number) => {
      // Validate question structure
      if (!q.text || !q.answers || !Array.isArray(q.answers) || q.answers.length !== 4) {
        console.error(`Invalid question structure at index ${index}:`, q);
        throw new Error(`Invalid question structure at index ${index}`);
      }

      // Validate that exactly one answer is correct
      const correctAnswers = q.answers.filter((a: any) => a.isCorrect);
      if (correctAnswers.length !== 1) {
        console.error(`Question ${index} must have exactly one correct answer:`, q);
        throw new Error(`Question ${index} must have exactly one correct answer`);
      }

      return {
        id: uuidv4(),
        text: q.text.trim(),
        context: q.context ? q.context.trim() : undefined,
        category,
        difficulty,
        answers: q.answers.map((a: any) => ({
          id: uuidv4(),
          text: a.text.trim(),
          isCorrect: Boolean(a.isCorrect)
        }))
      };
    });
    console.log(`Successfully generated ${formattedQuestions.length} questions`);
    console.log("Checking for duplicate questions...");
    const uniqueQuestions = [];
    let duplicatesFound = 0;
    
    for (const question of formattedQuestions) {
      const exists = await questionExists(question.text);
      if (exists) {
        console.log(`Duplicate found: ${question.text.substring(0, 50)}...`);
        duplicatesFound++;
      } else {
        uniqueQuestions.push(question);
      }
    }
    
    console.log(`📊 Found ${duplicatesFound} duplicates, ${uniqueQuestions.length} unique questions`);
    
    // If we don't have enough unique questions, generate more
    if (uniqueQuestions.length < count) {
      const additionalNeeded = count - uniqueQuestions.length;
      console.log(`Need ${additionalNeeded} more unique questions, generating additional ones...`);
      
      // Generate additional questions with different prompts
      const additionalPrompt = `
        Create ${additionalNeeded} more unique Bible trivia questions for a Christian trivia game.
        Category: ${category}
        Difficulty: ${difficulty}
        
        IMPORTANT: These questions must be DIFFERENT from common Bible trivia questions.
        Focus on lesser-known stories, specific details, or unique aspects of Bible stories.
        
        Return in this exact format:
        {
          "questions": [
            {
              "text": "What was the name of the woman who helped hide the Israelite spies in Jericho?",
              "context": "She was a prostitute who lived in the city wall",
              "category": "${category}",
              "difficulty": "${difficulty}",
              "answers": [
                {"text": "Rahab", "isCorrect": true},
                {"text": "Ruth", "isCorrect": false},
                {"text": "Deborah", "isCorrect": false},
                {"text": "Esther", "isCorrect": false}
              ]
            }
          ]
        }
      `;
      
      try {
        const additionalResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: additionalPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.9,
          max_tokens: 2000,
        });
        
        const additionalContent = additionalResponse.choices[0].message.content;
        if (additionalContent) {
          const additionalParsed = JSON.parse(additionalContent);
          const additionalQuestions = additionalParsed.questions || additionalParsed;
          
          for (const q of additionalQuestions) {
            if (uniqueQuestions.length >= count) break;
            
            const formattedQ = {
              id: uuidv4(),
              text: q.text.trim(),
              context: q.context ? q.context.trim() : undefined,
              category,
              difficulty,
              answers: q.answers.map((a: any) => ({
                id: uuidv4(),
                text: a.text.trim(),
                isCorrect: Boolean(a.isCorrect)
              }))
            };
            
            const exists = await questionExists(formattedQ.text);
            if (!exists) {
              uniqueQuestions.push(formattedQ);
            }
          }
        }
      } catch (additionalError) {
        console.error("Failed to generate additional questions:", additionalError);
      }
    }
    
    console.log(`✅ Final unique questions: ${uniqueQuestions.length}`);
    
    // Return questions for review instead of storing directly
    console.log("📋 Questions ready for review and validation");
    return uniqueQuestions;
    
  } catch (error) {
    console.error("Error generating questions with OpenAI:", error);
    
    // If AI generation fails, try to return some existing questions from the database
    try {
      console.log("🔄 AI generation failed, falling back to existing questions...");
      const existingQuestions = await database.getRandomQuestions({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        count: Math.min(count, 5) // Limit fallback to 5 questions
      });
      
      if (existingQuestions.length > 0) {
        console.log(`✅ Returning ${existingQuestions.length} existing questions as fallback`);
        return existingQuestions;
      }
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
    }
    
    throw new Error(`Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
