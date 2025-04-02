import React, { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Send, Phone, Video, Info } from "lucide-react";
import MessageList from "./message-list";
import { User, Message } from "@shared/schema";

// Extended message type for WebSocket messages that include sender information
type WebSocketMessage = Message & {
  sender?: Omit<User, "password">;
};

type ChatWindowProps = {
  selectedUser: Omit<User, "password">;
};

export default function ChatWindow({ selectedUser }: ChatWindowProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch messages between users
  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages/${selectedUser.id}`],
    enabled: !!user && !!selectedUser,
    refetchInterval: 5000, // Poll every 5 seconds as a fallback
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/messages", {
        receiverId: selectedUser.id,
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${selectedUser.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/messages/chats'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to send message: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set up WebSocket connection
  useEffect(() => {
    if (!user) return;

    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connection established");
      
      // Register the WebSocket connection with the user's ID
      ws.send(JSON.stringify({
        type: 'register',
        userId: user.id
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connection') {
          console.log("WebSocket connection confirmation:", data.message);
        } 
        else if (data.type === 'registered') {
          console.log("WebSocket registration successful for user:", data.userId);
        }
        else if (data.type === 'new_message') {
          const chatMessage = data.message as WebSocketMessage;
          
          // Show a toast notification for new messages
          if (chatMessage.senderId !== user.id) {
            // Get the sender info from the extended chatMessage object sent by the server
            const senderName = chatMessage.sender?.username || 'Someone';
            
            toast({
              title: "New message",
              description: `${senderName}: ${chatMessage.content.substring(0, 50)}${chatMessage.content.length > 50 ? '...' : ''}`,
            });
          }
          
          // If this message is part of the current conversation
          if (
            (chatMessage.senderId === user.id && chatMessage.receiverId === selectedUser.id) ||
            (chatMessage.senderId === selectedUser.id && chatMessage.receiverId === user.id)
          ) {
            queryClient.invalidateQueries({ queryKey: [`/api/messages/${selectedUser.id}`] });
          }
          
          // Update chats list
          queryClient.invalidateQueries({ queryKey: ['/api/messages/chats'] });
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };

    setSocket(ws);

    // Clean up on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [user, selectedUser.id, toast]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Only send via REST API - WebSocket updates will happen via server broadcast
    sendMessageMutation.mutate(message.trim());
    
    // Clear the input field
    setMessage("");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Chat header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center">
          <Avatar className="h-8 w-8 mr-3">
            <AvatarImage src={selectedUser.avatarUrl || undefined} alt={selectedUser.username} />
            <AvatarFallback>{selectedUser.username.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-sm font-medium">{selectedUser.username}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedUser.role === "teacher" ? "Teacher" : "Student"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground" disabled>
            <Video className="h-4 w-4" />
            <span className="sr-only">Video Call</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground" disabled>
            <Phone className="h-4 w-4" />
            <span className="sr-only">Phone Call</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground" disabled>
            <Info className="h-4 w-4" />
            <span className="sr-only">Info</span>
          </Button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages && Array.isArray(messages) && messages.length > 0 ? (
          <MessageList messages={messages} currentUser={user} otherUser={selectedUser} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t flex items-center">
        <Input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1"
        />
        <Button 
          type="submit" 
          size="icon" 
          className="ml-2 bg-primary text-white" 
          disabled={!message.trim() || sendMessageMutation.isPending}
        >
          {sendMessageMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
