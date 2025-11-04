import React, { useState, useEffect } from 'react';
import { Question, Answer } from '@shared/schema';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle, XCircle, AlertTriangle, Edit3, Save, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface QuestionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

interface QuestionReviewPanelProps {
  questions: Question[];
  onQuestionsStored: (storedQuestions: Question[]) => void;
  onClose: () => void;
}

export function QuestionReviewPanel({ questions, onQuestionsStored, onClose }: QuestionReviewPanelProps) {
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>(questions);
  const [validationResults, setValidationResults] = useState<QuestionValidationResult[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isStoring, setIsStoring] = useState(false);

  // Validate questions on load
  useEffect(() => {
    validateQuestions();
  }, [reviewQuestions]);

  const validateQuestions = async () => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/questions/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questions: reviewQuestions }),
      });

      if (response.ok) {
        const data = await response.json();
        setValidationResults(data.validationResults);
      } else {
        toast({
          title: "Validation Error",
          description: "Failed to validate questions",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error validating questions:', error);
      toast({
        title: "Validation Error",
        description: "Failed to validate questions",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const storeQuestions = async () => {
    setIsStoring(true);
    try {
      const response = await fetch('/api/questions/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questions: reviewQuestions }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: `Successfully stored ${data.storedQuestions.length} questions`,
        });
        onQuestionsStored(data.storedQuestions);
      } else {
        toast({
          title: "Storage Error",
          description: "Failed to store questions",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error storing questions:', error);
      toast({
        title: "Storage Error",
        description: "Failed to store questions",
        variant: "destructive",
      });
    } finally {
      setIsStoring(false);
    }
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updatedQuestions = [...reviewQuestions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setReviewQuestions(updatedQuestions);
  };

  const updateAnswer = (questionIndex: number, answerIndex: number, field: keyof Answer, value: any) => {
    const updatedQuestions = [...reviewQuestions];
    const updatedAnswers = [...updatedQuestions[questionIndex].answers];
    updatedAnswers[answerIndex] = { ...updatedAnswers[answerIndex], [field]: value };
    updatedQuestions[questionIndex] = { ...updatedQuestions[questionIndex], answers: updatedAnswers };
    setReviewQuestions(updatedQuestions);
  };

  const removeQuestion = (index: number) => {
    const updatedQuestions = reviewQuestions.filter((_, i) => i !== index);
    setReviewQuestions(updatedQuestions);
  };

  const toggleCorrectAnswer = (questionIndex: number, answerIndex: number) => {
    const updatedQuestions = [...reviewQuestions];
    const updatedAnswers = updatedQuestions[questionIndex].answers.map((answer, index) => ({
      ...answer,
      isCorrect: index === answerIndex
    }));
    updatedQuestions[questionIndex] = { ...updatedQuestions[questionIndex], answers: updatedAnswers };
    setReviewQuestions(updatedQuestions);
  };

  const isValid = validationResults.every(result => result.isValid);
  const hasErrors = validationResults.some(result => result.errors.length > 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Review Generated Questions</h2>
              <p className="text-gray-600 mt-1">
                Review and edit {reviewQuestions.length} AI-generated questions before storing them
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isValid ? "default" : "destructive"}>
                {isValid ? "Valid" : "Invalid"}
              </Badge>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={storeQuestions} 
                disabled={!isValid || isStoring}
                className="bg-green-600 hover:bg-green-700"
              >
                {isStoring ? "Storing..." : "Store Questions"}
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6">
          {reviewQuestions.map((question, questionIndex) => {
            const validation = validationResults[questionIndex];
            const isEditing = editingIndex === questionIndex;

            return (
              <Card key={question.id} className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      Question {questionIndex + 1}
                      {validation?.isValid ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingIndex(isEditing ? null : questionIndex)}
                      >
                        <Edit3 className="h-4 w-4 mr-1" />
                        {isEditing ? "Cancel" : "Edit"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeQuestion(questionIndex)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor={`question-${questionIndex}`}>Question Text</Label>
                        <Textarea
                          id={`question-${questionIndex}`}
                          value={question.text}
                          onChange={(e) => updateQuestion(questionIndex, 'text', e.target.value)}
                          placeholder="Enter question text..."
                        />
                      </div>

                      <div>
                        <Label htmlFor={`context-${questionIndex}`}>Context (Optional)</Label>
                        <Textarea
                          id={`context-${questionIndex}`}
                          value={question.context || ''}
                          onChange={(e) => updateQuestion(questionIndex, 'context', e.target.value)}
                          placeholder="Enter context..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`category-${questionIndex}`}>Category</Label>
                          <Select
                            value={question.category}
                            onValueChange={(value) => updateQuestion(questionIndex, 'category', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="All Categories">All Categories</SelectItem>
                              <SelectItem value="Old Testament">Old Testament</SelectItem>
                              <SelectItem value="New Testament">New Testament</SelectItem>
                              <SelectItem value="Bible Stories">Bible Stories</SelectItem>
                              <SelectItem value="Famous People">Famous People</SelectItem>
                              <SelectItem value="Theme-Based">Theme-Based</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor={`difficulty-${questionIndex}`}>Difficulty</Label>
                          <Select
                            value={question.difficulty}
                            onValueChange={(value) => updateQuestion(questionIndex, 'difficulty', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                            <SelectItem value="Beginner">Beginner</SelectItem>
                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                            <SelectItem value="Advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label>Answers</Label>
                        <div className="space-y-2">
                          {question.answers.map((answer, answerIndex) => (
                            <div key={answer.id} className="flex items-center gap-2">
                              <Button
                                variant={answer.isCorrect ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleCorrectAnswer(questionIndex, answerIndex)}
                                className={answer.isCorrect ? "bg-green-600 hover:bg-green-700" : ""}
                              >
                                {answer.isCorrect ? "✓" : "○"}
                              </Button>
                              <Input
                                value={answer.text}
                                onChange={(e) => updateAnswer(questionIndex, answerIndex, 'text', e.target.value)}
                                placeholder={`Answer ${answerIndex + 1}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold">{question.text}</h3>
                        {question.context && (
                          <p className="text-sm text-gray-600 mt-1">{question.context}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{question.category}</Badge>
                        <Badge variant="outline">{question.difficulty}</Badge>
                      </div>

                      <div className="space-y-2">
                        {question.answers.map((answer, answerIndex) => (
                          <div
                            key={answer.id}
                            className={`p-3 rounded border ${
                              answer.isCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">
                                {String.fromCharCode(65 + answerIndex)}.
                              </span>
                              <span>{answer.text}</span>
                              {answer.isCorrect && (
                                <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation Messages */}
                  {validation && (
                    <div className="mt-4 space-y-2">
                      {validation.errors.length > 0 && (
                        <Alert variant="destructive">
                          <XCircle className="h-4 w-4" />
                          <AlertDescription>
                            <ul className="list-disc list-inside">
                              {validation.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}

                      {validation.warnings.length > 0 && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <ul className="list-disc list-inside">
                              {validation.warnings.map((warning, index) => (
                                <li key={index}>{warning}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}

                      {validation.suggestions.length > 0 && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <ul className="list-disc list-inside">
                              {validation.suggestions.map((suggestion, index) => (
                                <li key={index}>{suggestion}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}