import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";

// Define the message type for WebSocket
type WebSocketMessage = {
  type: string;
  message?: {
    id: number;
    senderId: number;
    receiverId: number;
    content: string;
    createdAt: string;
    read: boolean;
    sender?: Omit<User, "password">;
  };
  userIds?: number[];
  userId?: number;
};

type NotificationContextType = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  resetUnreadCount: () => void;
  onlineUserIds: number[];
  isUserOnline: (userId: number) => boolean;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  // Function to increment unread count
  const incrementUnreadCount = () => {
    setUnreadCount((prev) => prev + 1);
  };

  // Function to reset unread count
  const resetUnreadCount = () => {
    setUnreadCount(0);
  };
  
  // Function to check if a user is online
  const isUserOnline = (userId: number): boolean => {
    return onlineUserIds.includes(userId);
  };

  // Setup WebSocket connection
  useEffect(() => {
    if (user) {
      // Close any existing connection
      if (socket) {
        socket.close();
      }

      // Create WebSocket connection with better cross-platform compatibility
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      try {
        console.log(`Connecting to WebSocket at: ${wsUrl}`);
        const newSocket = new WebSocket(wsUrl);
        setSocket(newSocket);

        newSocket.onopen = () => {
          console.log("WebSocket connection established");
          // Register the client with user ID
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ type: "register", userId: user.id }));
          }
        };

        newSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            
            if (data.type === "new_message" && data.message) {
              // Show notification toast
              toast({
                title: `New message from ${data.message.sender?.username || "User"}`,
                description: data.message.content.length > 50 
                  ? data.message.content.substring(0, 50) + "..." 
                  : data.message.content,
                duration: 5000,
              });
              
              // Increment unread count
              incrementUnreadCount();
            }
            else if (data.type === "online_users" && data.userIds) {
              // Update online users list
              setOnlineUserIds(data.userIds);
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        newSocket.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        newSocket.onclose = () => {
          console.log("WebSocket connection closed");
        };

        // Cleanup on unmount
        return () => {
          newSocket.close();
        };
      } catch (error) {
        console.error("Error setting up WebSocket:", error);
      }
    }
  }, [user, toast]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        setUnreadCount,
        incrementUnreadCount,
        resetUnreadCount,
        onlineUserIds,
        isUserOnline,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}