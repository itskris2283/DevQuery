import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/main-layout";
import QuestionCard from "@/components/question/question-card";
import AnswerCard from "@/components/answer/answer-card";
import AnswerForm from "@/components/answer/answer-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { user } = useAuth();

  // Parse ID to number
  const questionId = parseInt(id, 10);

  // Handle invalid ID
  if (isNaN(questionId)) {
    navigate("/not-found");
  }

  // Fetch question details
  const { 
    data: question, 
    isLoading: isLoadingQuestion, 
    isError: isErrorQuestion 
  } = useQuery({
    queryKey: [`/api/questions/${questionId}`],
    enabled: !isNaN(questionId),
  });

  // Fetch answers
  const { 
    data: answers, 
    isLoading: isLoadingAnswers, 
    isError: isErrorAnswers 
  } = useQuery({
    queryKey: [`/api/questions/${questionId}/answers`],
    enabled: !isNaN(questionId),
  });

  // Handle error - redirect to not found
  useEffect(() => {
    if (isErrorQuestion || isErrorAnswers) {
      navigate("/not-found");
    }
  }, [isErrorQuestion, isErrorAnswers, navigate]);

  const isLoading = isLoadingQuestion || isLoadingAnswers;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!question) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center py-20">
          <p>Question not found.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          className="mb-4 -ml-2 flex items-center"
          onClick={() => navigate("/questions")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Questions
        </Button>

        <QuestionCard question={question} showFullContent />

        {/* Answers section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            {answers?.length || 0} Answers
          </h2>
          <Separator className="my-4" />

          {answers && answers.length > 0 ? (
            <div className="space-y-6">
              {answers.map((answer: any) => (
                <AnswerCard 
                  key={answer.id} 
                  answer={answer} 
                  questionUserId={question.userId}
                  questionSolved={question.solved}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 border rounded-lg">
              <p className="text-lg text-muted-foreground">No answers yet</p>
              <p className="text-sm text-muted-foreground mt-1">Be the first to answer this question</p>
            </div>
          )}
        </div>

        {/* Answer form */}
        {user ? (
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Your Answer</h3>
            <AnswerForm questionId={questionId} />
          </div>
        ) : (
          <div className="mt-8 text-center py-8 border rounded-lg">
            <p className="text-lg mb-4">You need to be logged in to answer</p>
            <Button onClick={() => navigate("/auth")}>
              Log in to Answer
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
