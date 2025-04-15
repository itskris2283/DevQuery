import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Eye, MoreVertical, Edit, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type QuestionCardProps = {
  question: QuestionWithUser;
  showFullContent?: boolean;
};

export default function QuestionCard({ question, showFullContent = false }: QuestionCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [isDownvoting, setIsDownvoting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/questions/${question.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
      // Redirect to questions page if on the deleted question's page
      if (location === `/questions/${question.id}`) {
        setLocation('/questions');
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete question: ${error.message}`,
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

  const handleEdit = () => {
    setLocation(`/questions/edit/${question.id}`);
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteQuestionMutation.mutate();
    setShowDeleteDialog(false);
  };

  // Check if current user is the author of the question
  const isAuthor = user && user.id === question.user.id;

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
                <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                  Solved
                </Badge>
              )}
              <Link href={`/questions/${question.id}`}>
                <a className="text-lg font-semibold hover:text-primary truncate">
                  {question.title}
                </a>
              </Link>
              
              {/* Add 3-dot menu dropdown for question owner */}
              {isAuthor && (
                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleEdit}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit question
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleDelete}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete question
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your question and all its answers.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
