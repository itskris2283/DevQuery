import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowBigUp, ArrowBigDown, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnswerWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type AnswerCardProps = {
  answer: AnswerWithUser;
  questionUserId: number;
  questionSolved: boolean;
};

export default function AnswerCard({ answer, questionUserId, questionSolved }: AnswerCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [isDownvoting, setIsDownvoting] = useState(false);

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async ({ value }: { value: number }) => {
      const res = await apiRequest("POST", "/api/votes", {
        answerId: answer.id,
        value,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/questions/${answer.questionId}/answers`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to vote: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Accept answer mutation
  const acceptAnswerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/questions/${answer.questionId}/solve`, {
        answerId: answer.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Answer marked as accepted",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/questions/${answer.questionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/questions/${answer.questionId}/answers`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to accept answer: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleVote = (value: number) => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "You must be logged in to vote",
        variant: "destructive",
      });
      return;
    }

    if (value === 1) {
      setIsUpvoting(true);
    } else {
      setIsDownvoting(true);
    }

    voteMutation.mutate(
      { value },
      {
        onSettled: () => {
          setIsUpvoting(false);
          setIsDownvoting(false);
        },
      }
    );
  };

  const handleAcceptAnswer = () => {
    acceptAnswerMutation.mutate();
  };

  // Check if current user is question author and can accept answer
  const canAcceptAnswer = user?.id === questionUserId && !questionSolved && !answer.accepted;

  return (
    <Card className={cn("mb-4", {
      "border-green-500 dark:border-green-700": answer.accepted,
    })}>
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Vote count and accept button */}
          <div className="flex-shrink-0 flex flex-col items-center space-y-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-muted-foreground hover:text-primary group relative", {
                "text-primary": isUpvoting,
              })}
              onClick={() => handleVote(1)}
              disabled={voteMutation.isPending}
            >
              <ArrowBigUp className="h-6 w-6" />
              <span className="sr-only">Vote Up</span>
              <span className="hidden group-hover:block absolute -right-16 top-0 bg-background border text-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
                Vote Up
              </span>
            </Button>
            <span className="font-medium">{answer.votesCount}</span>
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-muted-foreground hover:text-destructive group relative", {
                "text-destructive": isDownvoting,
              })}
              onClick={() => handleVote(-1)}
              disabled={voteMutation.isPending}
            >
              <ArrowBigDown className="h-6 w-6" />
              <span className="sr-only">Vote Down</span>
              <span className="hidden group-hover:block absolute -right-16 top-0 bg-background border text-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
                Vote Down
              </span>
            </Button>
            
            {answer.accepted ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-green-600 dark:text-green-500 cursor-default mt-2"
                disabled
              >
                <Check className="h-6 w-6" />
                <span className="sr-only">Accepted Answer</span>
              </Button>
            ) : canAcceptAnswer ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-green-600 dark:hover:text-green-500 mt-2 group relative"
                onClick={handleAcceptAnswer}
                disabled={acceptAnswerMutation.isPending}
              >
                <Check className="h-6 w-6" />
                <span className="sr-only">Accept Answer</span>
                <span className="hidden group-hover:block absolute -right-20 top-0 bg-background border text-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
                  Accept Answer
                </span>
              </Button>
            ) : null}
          </div>

          {/* Answer content */}
          <div className="flex-1 min-w-0">
            <p className="text-foreground mb-3">
              {answer.content}
            </p>

            {answer.imageUrl && (
              <div className="mb-3">
                <img
                  src={answer.imageUrl}
                  alt="Answer image"
                  className="h-40 rounded-md object-cover"
                />
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center">
                {answer.user.role === "teacher" && (
                  <Badge variant="outline" className="mr-2 bg-primary text-white">
                    Teacher
                  </Badge>
                )}
                <Avatar className="h-6 w-6 mr-2">
                  <AvatarImage src={answer.user.avatarUrl || ''} alt={answer.user.username} />
                  <AvatarFallback>{answer.user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <Link href={`/users/${answer.user.id}`}>
                    <span className="text-sm font-medium hover:text-primary cursor-pointer">
                      {answer.user.username}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    answered {formatDistanceToNow(new Date(answer.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
