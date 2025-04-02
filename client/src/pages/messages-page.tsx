import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import MainLayout from "@/components/layout/main-layout";
import ChatWindow from "@/components/chat/chat-window";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function MessagesPage() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialUserId = searchParams.get("userId");
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch user chats
  const { data: chats, isLoading: isLoadingChats } = useQuery({
    queryKey: ['/api/messages/chats'],
    enabled: !!user,
  });

  // Fetch specific user if userId is in URL
  const { data: specificUser, isLoading: isLoadingSpecificUser } = useQuery({
    queryKey: [`/api/users/${initialUserId}`],
    enabled: !!initialUserId && !!user,
    onSuccess: (data) => {
      if (data) {
        setSelectedUser(data);
      }
    },
  });

  // Search for users
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['/api/users/search', { query: searchQuery }],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return null;
      
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      return response.json();
    },
    enabled: searchQuery.length >= 2,
  });

  // Handle search selection
  const handleSelectSearchResult = (user: any) => {
    setSelectedUser(user);
    setSearchQuery("");
    // Update URL
    navigate(`/messages?userId=${user.id}`);
  };

  // Handle chat selection
  const handleSelectChat = (chat: any) => {
    setSelectedUser(chat.user);
    // Update URL
    navigate(`/messages?userId=${chat.user.id}`);
  };

  return (
    <MainLayout>
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 h-[calc(100vh-12rem)]">
          {/* Users list */}
          <div className="border-r">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search contacts..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Search results dropdown */}
              {searchQuery.length >= 2 && (
                <div className="absolute z-10 mt-1 w-full max-w-[calc(100%-2rem)] bg-background border rounded-md shadow-md max-h-60 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-3 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : searchResults && searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-3 hover:bg-accent cursor-pointer border-b last:border-0"
                        onClick={() => handleSelectSearchResult(result)}
                      >
                        <div className="flex items-center">
                          <Avatar className="h-8 w-8 mr-2">
                            <AvatarImage src={result.avatarUrl} alt={result.username} />
                            <AvatarFallback>{result.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{result.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {result.role === "teacher" ? "Teacher" : "Student"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-muted-foreground">
                      No users found
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="overflow-y-auto h-[calc(100%-57px)]">
              {isLoadingChats ? (
                // Loading skeletons
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="p-3 border-b flex items-center">
                    <div className="flex-shrink-0 mr-3">
                      <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="h-4 w-24 bg-muted animate-pulse mb-1 rounded" />
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))
              ) : chats && chats.length > 0 ? (
                chats.map((chat) => (
                  <div
                    key={chat.user.id}
                    className={`p-3 border-b hover:bg-accent cursor-pointer ${
                      selectedUser?.id === chat.user.id ? "bg-accent" : ""
                    }`}
                    onClick={() => handleSelectChat(chat)}
                  >
                    <div className="flex items-center">
                      <div className="relative mr-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={chat.user.avatarUrl} alt={chat.user.username} />
                          <AvatarFallback>{chat.user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 ${
                            Math.random() > 0.5 ? "bg-green-500" : "bg-gray-300"
                          } border-2 border-background rounded-full`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="text-sm font-medium truncate">
                            {chat.user.username}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(chat.lastMessage.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {chat.lastMessage.content}
                        </p>
                        
                        {chat.unreadCount > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="ml-auto mt-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
                          >
                            {chat.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground mb-2">No conversations yet</p>
                  <p className="text-sm text-muted-foreground">
                    Use the search above to find users and start a conversation
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Chat area */}
          <div className="col-span-2 flex flex-col">
            {selectedUser ? (
              <ChatWindow selectedUser={selectedUser} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Your Messages</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Select a conversation or search for a user to start chatting
                </p>
                <p className="text-sm text-muted-foreground">
                  You can message teachers, students, and other developers
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
