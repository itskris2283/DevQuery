import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export default function MyAnswersPage() {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>("all");

  // Fetch user's answers
  const { data: answers, isLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/answers`],
    enabled: !!user,
  });

  // Apply filter
  const filteredAnswers = answers ? 
    filter === "all" ? answers : 
    filter === "accepted" ? answers.filter(a => a.accepted) :
    answers.filter(a => !a.accepted) : 
    [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">My Answers</h1>
          <Button onClick={() => navigate("/questions")}>
            Browse Questions
          </Button>
        </div>

        <div className="flex justify-end">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Answers</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="not-accepted">Not Accepted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredAnswers.length > 0 ? (
          <div className="space-y-4">
            {filteredAnswers.map((answer) => (
              <Card key={answer.id} className={answer.accepted ? "border-green-500" : ""}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Answer to Question:</h3>
                      {answer.accepted && (
                        <Badge variant="success">Accepted</Badge>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center"
                      onClick={() => navigate(`/questions/${answer.questionId}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Question
                    </Button>
                  </div>
                  
                  <p className="text-muted-foreground mb-4">{answer.content}</p>
                  
                  {answer.imageUrl && (
                    <img
                      src={answer.imageUrl}
                      alt="Answer image"
                      className="h-40 rounded-md object-cover mb-4"
                    />
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Votes:</span>
                      <span className={
                        answer.votesCount > 0 
                          ? "text-green-600 dark:text-green-400" 
                          : answer.votesCount < 0 
                            ? "text-red-600 dark:text-red-400" 
                            : ""
                      }>
                        {answer.votesCount}
                      </span>
                    </div>
                    
                    <span className="text-muted-foreground">
                      Answered {format(new Date(answer.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-lg">
            <h3 className="text-lg font-medium mb-2">
              {filter === "all" ? 
                "You haven't answered any questions yet" : 
                filter === "accepted" ? 
                  "You don't have any accepted answers" : 
                  "You don't have any non-accepted answers"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {filter === "all" ? 
                "Help others by answering their questions" : 
                "Keep providing valuable answers to get them accepted"}
            </p>
            <Button onClick={() => navigate("/questions")}>
              Browse Questions to Answer
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
