import { useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuestionWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type QuestionCardProps = {
  question: QuestionWithUser;
  showFullContent?: boolean;
};

export default function QuestionCard({ question, showFullContent = false }: QuestionCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [isDownvoting, setIsDownvoting] = useState(false);

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async ({ value }: { value: number }) => {
      const res = await apiRequest("POST", "/api/votes", {
        questionId: question.id,
        value,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/questions/${question.id}`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to vote: ${error.message}`,
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

  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Vote count */}
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
            <span className="font-medium">{question.votesCount}</span>
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
          </div>

          {/* Question content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {question.solved && (
                <Badge variant="success" className="px-1.5 py-0.5 text-xs">
                  Solved
                </Badge>
              )}
              <Link href={`/questions/${question.id}`}>
                <a className="text-lg font-semibold hover:text-primary truncate">
                  {question.title}
                </a>
              </Link>
            </div>

            <p className={cn("text-muted-foreground mb-3", {
              "line-clamp-2": !showFullContent,
            })}>
              {question.content}
            </p>

            {question.imageUrl && (
              <div className="mb-3">
                <img
                  src={question.imageUrl}
                  alt="Question image"
                  className="h-40 rounded-md object-cover"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              {question.tags.map((tag) => (
                <Link key={tag.id} href={`/questions?tag=${tag.name}`}>
                  <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center">
                  <MessageSquare className="mr-1 h-4 w-4" /> {question.answersCount} answers
                </span>
                <span className="flex items-center">
                  <Eye className="mr-1 h-4 w-4" /> {question.views || 0} views
                </span>
              </div>

              <div className="flex items-center">
                {question.user.role === "teacher" && (
                  <Badge variant="outline" className="mr-2 bg-primary text-white">
                    Teacher
                  </Badge>
                )}
                <Avatar className="h-6 w-6 mr-2">
                  <AvatarImage src={question.user.avatarUrl || ''} alt={question.user.username} />
                  <AvatarFallback>{question.user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <Link href={`/users/${question.user.id}`}>
                    <span className="text-sm font-medium hover:text-primary cursor-pointer">
                      {question.user.username}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    asked {formatDistanceToNow(new Date(question.createdAt), { addSuffix: true })}
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
