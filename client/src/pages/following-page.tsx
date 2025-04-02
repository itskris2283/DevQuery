import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/main-layout";
import UserCard from "@/components/user/user-card";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus } from "lucide-react";
import { useLocation } from "wouter";

export default function FollowingPage() {
  const [_, navigate] = useLocation();
  
  // Fetch users that the current user follows
  const { data: followingUsers, isLoading } = useQuery({
    queryKey: ['/api/user/following'],
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">People You Follow</h1>
          <Button onClick={() => navigate("/users")}>
            <UserPlus className="h-4 w-4 mr-1" /> Find Users
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : followingUsers && followingUsers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {followingUsers.map((user: any) => (
              <UserCard 
                key={user.id} 
                user={user} 
                stats={{
                  answersCount: user.answersCount || 0,
                  questionsCount: user.questionsCount || 0,
                  followerCount: user.followerCount || 0
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-lg">
            <h3 className="text-lg font-medium mb-2">You're not following anyone yet</h3>
            <p className="text-muted-foreground mb-6">
              Follow other users to see their activity and connect with them
            </p>
            <Button onClick={() => navigate("/users")}>
              <UserPlus className="h-4 w-4 mr-1" /> Find Users to Follow
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
