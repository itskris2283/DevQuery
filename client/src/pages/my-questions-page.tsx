import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/main-layout";
import QuestionCard from "@/components/question/question-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function MyQuestionsPage() {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>("all");

  // Fetch user's questions
  const { data: questions, isLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/questions`],
    enabled: !!user,
  });

  // Apply filter
  const filteredQuestions = questions ? 
    filter === "all" ? questions : 
    filter === "solved" ? questions.filter(q => q.solved) :
    questions.filter(q => !q.solved) : 
    [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">My Questions</h1>
          <Button onClick={() => navigate("/questions/ask")}>
            <PlusIcon className="h-4 w-4 mr-1" /> Ask Question
          </Button>
        </div>

        <div className="flex justify-end">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Questions</SelectItem>
              <SelectItem value="solved">Solved</SelectItem>
              <SelectItem value="unsolved">Unsolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredQuestions.length > 0 ? (
          <div className="space-y-4">
            {filteredQuestions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-lg">
            <h3 className="text-lg font-medium mb-2">
              {filter === "all" ? 
                "You haven't asked any questions yet" : 
                filter === "solved" ? 
                  "You don't have any solved questions" : 
                  "You don't have any unsolved questions"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {filter === "all" ? 
                "Ask a question to get help from the community" : 
                "Check back later or ask more questions"}
            </p>
            <Button onClick={() => navigate("/questions/ask")}>
              <PlusIcon className="h-4 w-4 mr-1" /> Ask a Question
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
