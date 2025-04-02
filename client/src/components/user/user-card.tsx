import { useState } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type UserCardProps = {
  user: Omit<User, "password">;
  stats?: {
    answersCount: number;
    questionsCount: number;
    followerCount: number;
  };
};

export default function UserCard({ user, stats }: UserCardProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);

  // Check if current user is following this user
  const { data: followingUsers } = useQuery({
    queryKey: ['/api/user/following'],
    enabled: !!currentUser,
    onSuccess: (data) => {
      const isFollowingUser = data?.some((u: any) => u.id === user.id);
      setIsFollowing(isFollowingUser);
    }
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/follow", {
        followingId: user.id
      });
      return res.json();
    },
    onSuccess: () => {
      setIsFollowing(true);
      toast({
        title: "Success",
        description: `You are now following ${user.username}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/following'] });
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
      const res = await apiRequest("DELETE", `/api/follow/${user.id}`);
      return res.json();
    },
    onSuccess: () => {
      setIsFollowing(false);
      toast({
        title: "Success",
        description: `You have unfollowed ${user.username}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/following'] });
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
      return;
    }

    if (currentUser.id === user.id) {
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

  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <Avatar className="h-12 w-12 mr-3">
              <AvatarImage src={user.avatarUrl || ''} alt={user.username} />
              <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <Link href={`/users/${user.id}`}>
                <a className="font-medium hover:text-primary">{user.username}</a>
              </Link>
              <div className="flex items-center text-xs text-primary mt-0.5">
                {user.role === "teacher" ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                      <path d="M14 12a4 4 0 0 0 0-8 4 4 0 0 0 0 8Z"/>
                      <path d="M13.7 14h-3.4c-2 0-3.6 1.8-3.6 3.8v.4"/>
                      <path d="M19 17.8c0-2-1.6-3.8-3.6-3.8"/>
                    </svg>
                    <span>Teacher</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span>Student</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {currentUser && currentUser.id !== user.id && (
            <Button
              size="sm"
              variant={isFollowing ? "outline" : "default"}
              className="flex items-center"
              onClick={handleFollowToggle}
              disabled={followMutation.isPending || unfollowMutation.isPending}
            >
              {isFollowing ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <polyline points="17 11 19 13 23 9"/>
                  </svg>
                  Following
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                  Follow
                </>
              )}
            </Button>
          )}
        </div>
        
        {user.bio && (
          <p className="text-sm text-muted-foreground mb-4">
            {user.bio}
          </p>
        )}
        
        {stats && (
          <div className="flex space-x-4 mb-4 text-sm">
            <div>
              <span className="font-semibold">{stats.answersCount}</span>
              <span className="text-muted-foreground"> answers</span>
            </div>
            <div>
              <span className="font-semibold">{stats.questionsCount}</span>
              <span className="text-muted-foreground"> questions</span>
            </div>
            <div>
              <span className="font-semibold">{stats.followerCount}</span>
              <span className="text-muted-foreground"> followers</span>
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100">
            react.js
          </Badge>
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 hover:bg-green-100">
            node.js
          </Badge>
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-300 hover:bg-yellow-100">
            mongodb
          </Badge>
        </div>
        
        {currentUser && currentUser.id !== user.id && (
          <div className="mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => window.location.href = `/messages?userId=${user.id}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Send Message
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
