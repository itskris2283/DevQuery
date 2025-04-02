import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import MainLayout from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import QuestionCard from "@/components/question/question-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Mail, MessageSquare, UserPlus, UserCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  
  // Parse ID to number
  const userId = parseInt(id, 10);

  // Handle invalid ID
  if (isNaN(userId)) {
    navigate("/not-found");
  }

  // Fetch user details
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: [`/api/users/${userId}`],
    enabled: !isNaN(userId),
  });

  // Fetch user questions
  const { data: questions, isLoading: isLoadingQuestions } = useQuery({
    queryKey: [`/api/users/${userId}/questions`],
    enabled: !isNaN(userId),
  });

  // Fetch user answers
  const { data: answers, isLoading: isLoadingAnswers } = useQuery({
    queryKey: [`/api/users/${userId}/answers`],
    enabled: !isNaN(userId),
  });

  // Check if current user is following this user
  const { data: followingUsers } = useQuery({
    queryKey: ['/api/user/following'],
    enabled: !!currentUser,
  });

  const isFollowing = followingUsers?.some((u: any) => u.id === userId);

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/follow", {
        followingId: userId
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `You are now following ${user.username}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/following'] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to follow user: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/follow/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `You have unfollowed ${user.username}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/following'] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to unfollow user: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const handleFollowToggle = () => {
    if (!currentUser) {
      toast({
        title: "Login Required",
        description: "You must be logged in to follow users",
        variant: "destructive"
      });
      navigate("/auth");
      return;
    }

    if (currentUser.id === userId) {
      toast({
        title: "Error",
        description: "You cannot follow yourself",
        variant: "destructive"
      });
      return;
    }

    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const isLoading = isLoadingUser || isLoadingQuestions || isLoadingAnswers;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-4">User not found</h1>
          <p className="text-muted-foreground mb-6">
            The user you're looking for does not exist or has been removed.
          </p>
          <Button onClick={() => navigate("/users")}>
            Browse Users
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* User profile header */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.avatarUrl || ''} alt={user.username} />
              <AvatarFallback className="text-3xl">{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    {user.username}
                    {user.role === "teacher" && (
                      <Badge className="bg-primary text-primary-foreground">Teacher</Badge>
                    )}
                  </h1>
                  <p className="text-muted-foreground">
                    Member since {format(new Date(user.createdAt), 'MMMM yyyy')}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {currentUser && currentUser.id !== user.id && (
                    <>
                      <Button
                        variant={isFollowing ? "outline" : "default"}
                        onClick={handleFollowToggle}
                        disabled={followMutation.isPending || unfollowMutation.isPending}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="mr-1 h-4 w-4" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1 h-4 w-4" />
                            Follow
                          </>
                        )}
                      </Button>
                      
                      <Button variant="outline" onClick={() => navigate(`/messages?userId=${user.id}`)}>
                        <MessageSquare className="mr-1 h-4 w-4" />
                        Message
                      </Button>
                    </>
                  )}
                  
                  {user.email && (
                    <Button variant="outline" onClick={() => window.location.href = `mailto:${user.email}`}>
                      <Mail className="mr-1 h-4 w-4" />
                      Email
                    </Button>
                  )}
                </div>
              </div>
              
              {user.bio && (
                <p className="mt-4 text-muted-foreground">{user.bio}</p>
              )}
              
              <div className="flex flex-wrap gap-x-8 gap-y-2 mt-6">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">{user.questionsCount || 0}</span>
                  <span className="text-muted-foreground text-sm">Questions</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">{user.answersCount || 0}</span>
                  <span className="text-muted-foreground text-sm">Answers</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">{user.followerCount || 0}</span>
                  <span className="text-muted-foreground text-sm">Followers</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">{user.followingCount || 0}</span>
                  <span className="text-muted-foreground text-sm">Following</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tabs for questions and answers */}
        <Tabs defaultValue="questions" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="answers">Answers</TabsTrigger>
          </TabsList>
          
          <TabsContent value="questions" className="mt-6">
            <h2 className="text-xl font-semibold mb-4">Questions by {user.username}</h2>
            
            {questions && questions.length > 0 ? (
              <div className="space-y-4">
                {questions.map((question) => (
                  <QuestionCard key={question.id} question={question} />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border rounded-lg">
                <p className="text-lg text-muted-foreground">No questions yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {user.username} hasn't asked any questions yet
                </p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="answers" className="mt-6">
            <h2 className="text-xl font-semibold mb-4">Answers by {user.username}</h2>
            
            {answers && answers.length > 0 ? (
              <div className="space-y-6">
                {answers.map((answer) => (
                  <div key={answer.id} className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">
                        Answered a question: 
                        <Button 
                          variant="link" 
                          className="p-0 h-auto font-semibold ml-2"
                          onClick={() => navigate(`/questions/${answer.questionId}`)}
                        >
                          Question title
                        </Button>
                      </h3>
                      
                      {answer.accepted && (
                        <Badge variant="success">Accepted</Badge>
                      )}
                    </div>
                    
                    <p className="text-muted-foreground">{answer.content}</p>
                    
                    {answer.imageUrl && (
                      <img
                        src={answer.imageUrl}
                        alt="Answer image"
                        className="h-40 rounded-md object-cover"
                      />
                    )}
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center">
                        <span className="font-medium mr-2">Votes:</span>
                        <span 
                          className={answer.votesCount > 0 
                            ? "text-green-600" 
                            : answer.votesCount < 0 
                              ? "text-red-600" 
                              : ""}
                        >
                          {answer.votesCount}
                        </span>
                      </div>
                      
                      <span className="text-muted-foreground">
                        {format(new Date(answer.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border rounded-lg">
                <p className="text-lg text-muted-foreground">No answers yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {user.username} hasn't answered any questions yet
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
