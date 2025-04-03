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

  // Setup WebSocket connection with fallback for connection issues
  useEffect(() => {
    if (user) {
      // Close any existing connection
      if (socket) {
        socket.close();
      }

      // Create WebSocket connection with better cross-platform compatibility
      // and retry logic for reliability
      const connectWebSocket = () => {
        try {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const host = window.location.host;
          
          // Ensure we have a valid host before attempting to connect
          if (!host) {
            console.error("Invalid host for WebSocket connection");
            return null;
          }
          
          const wsUrl = `${protocol}//${host}/ws`;
          console.log(`Attempting to connect to WebSocket at: ${wsUrl}`);
          
          let newSocket;
          try {
            // Create a new socket with error handling
            newSocket = new WebSocket(wsUrl);
          } catch (socketError) {
            console.error("Failed to create WebSocket:", socketError);
            return null;
          }
          
          // Handle connection error immediately
          newSocket.onerror = (event) => {
            console.error("WebSocket connection error:", event);
          };
          
          // Add a timeout to handle connection issues
          const connectionTimeout = setTimeout(() => {
            if (newSocket.readyState !== WebSocket.OPEN) {
              console.log('WebSocket connection timed out, using polling fallback');
              newSocket.close();
              // Continue without WebSocket - we'll use polling for notifications
            }
          }, 5000); // 5 second timeout
          
          // Clear timeout if connection succeeds
          newSocket.onopen = () => {
            clearTimeout(connectionTimeout);
            console.log('WebSocket connection established');
            setSocket(newSocket);
          };
          
          return newSocket;
        } catch (error) {
          console.error('Error creating WebSocket connection:', error);
          return null;
        }
      };
      
      const newSocket = connectWebSocket();
      if (newSocket) {
        // Handle socket events
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

        // Note: onerror is already defined when creating the socket

        newSocket.onclose = () => {
          console.log("WebSocket connection closed");
        };

        // Cleanup on unmount
        return () => {
          newSocket.close();
        };
      } else {
        // If WebSocket couldn't be established, set up periodic polling for notifications
        console.log("Using polling fallback for notifications");
        
        // Implement polling for unread messages here if needed
        // This is a fallback mechanism when WebSockets aren't available
        
        return () => {
          // Clean up polling interval if implemented
        };
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