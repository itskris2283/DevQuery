import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/main-layout";
import UserCard from "@/components/user/user-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [role, setRole] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  // Fetch users
  const { data: users, isLoading } = useQuery({
    queryKey: ['/api/users/search', { query: searchQuery }],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return null;
      
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      const data = await response.json();
      setSearchResults(data);
      return data;
    },
    enabled: searchQuery.length >= 2,
  });

  // Handle search form submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.length >= 2) {
      // The query will run automatically due to the dependency on searchQuery
    }
  };

  // Filter users by role
  const filteredUsers = searchResults 
    ? (role === "all" 
      ? searchResults 
      : searchResults.filter(user => user.role === role))
    : null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Find Users</h1>
          
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="teacher">Teachers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search users by username or email..."
              className="pl-10 py-6 text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button 
              type="submit"
              className="absolute right-1 top-1 bottom-1"
              disabled={searchQuery.length < 2}
            >
              Search
            </Button>
          </div>
          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-sm text-muted-foreground mt-2">Please enter at least 2 characters</p>
          )}
        </form>

        {/* Search results */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="ml-3">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20 mt-1" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4 mb-4" />
                <div className="flex space-x-4 mb-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : searchResults ? (
          filteredUsers && filteredUsers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredUsers.map((user) => (
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
            <div className="text-center py-16">
              <p className="text-lg text-muted-foreground">No users found matching your search criteria</p>
              {role !== "all" && (
                <Button 
                  variant="link" 
                  onClick={() => setRole("all")}
                  className="mt-2"
                >
                  Clear role filter
                </Button>
              )}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold mb-2">Search for Users</h2>
            <p className="text-muted-foreground mb-6">
              Find developers, teachers and students by name or email
            </p>
            <p className="text-sm text-muted-foreground italic">
              Type at least 2 characters to search
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
