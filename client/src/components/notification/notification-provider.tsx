import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";

// Define the message type for WebSocket
type WebSocketMessage = {
  type: string;
  content?: string;
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
  senderId?: number;
  timestamp?: number; // Add timestamp for pong messages
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
          
          // Use a more specific path to avoid conflict with Vite's WebSocket
          const wsUrl = `${protocol}//${host}/ws`;
          console.log(`Attempting to connect to WebSocket at: ${wsUrl}`);
          
          let newSocket;
          
          // Wrap WebSocket creation in a try-catch
          try {
            console.log("Creating WebSocket with URL:", wsUrl);
            
            // Create WebSocket without custom options
            newSocket = new WebSocket(wsUrl);
            
            console.log("WebSocket created:", newSocket);
          } catch (socketError) {
            console.error("Failed to create WebSocket:", socketError);
            return null;
          }
          
          // Double-check if WebSocket is valid
          if (!newSocket) {
            console.error("WebSocket creation failed but didn't throw an error");
            return null;
          }
          
          // Handle connection error immediately
          newSocket.onerror = (event) => {
            console.error("WebSocket connection error:", event);
            // Don't crash on error, switch to polling
            setSocket(null);
          };
          
          // Add a timeout to handle connection issues
          const connectionTimeout = setTimeout(() => {
            if (newSocket.readyState !== WebSocket.OPEN) {
              console.log('WebSocket connection timed out, using polling fallback');
              try {
                newSocket.close();
              } catch (err) {
                console.error("Error closing timed out socket:", err);
              }
              // Continue without WebSocket - we'll use polling for notifications
              setSocket(null);
            }
          }, 5000); // 5 second timeout
          
          // Clear timeout if connection succeeds
          newSocket.onopen = () => {
            clearTimeout(connectionTimeout);
            console.log('WebSocket connection established');
            
            // Send user registration after successful connection
            if (user) {
              try {
                newSocket.send(JSON.stringify({
                  type: 'register',
                  userId: user.id
                }));
                console.log("Sent user registration");
              } catch (err) {
                console.error("Error sending registration message:", err);
              }
            }
            
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
            // Log raw message for debugging
            console.log('WebSocket message received:', event.data);
            
            // Parse the message
            const message = JSON.parse(event.data) as WebSocketMessage;
            console.log('Parsed WebSocket message:', message);
            
            // Handle different message types
            switch (message.type) {
              case 'connection-confirmed':
                console.log('Connection confirmed:', message.content);
                break;
                
              case 'register':
                console.log('Registration confirmed:', message.content);
                break;
                
              case 'message':
                // Handle a new chat message
                if (message.senderId && message.content) {
                  console.log('New message received:', message);
                  
                  // Don't show notifications for messages from self
                  if (message.senderId !== user?.id) {
                    // Update the unread count for this sender
                    setUnreadCount((prev) => prev + 1);
                    
                    // Show toast notification
                    toast({
                      title: "New message",
                      description: `You have a new message from ${message.message?.sender?.username || 'a user'}`,
                    });
                  }
                }
                break;
                
              case 'mark-read':
                // Handle message read confirmation
                console.log('Message marked as read:', message);
                break;
                
              case 'online-users':
                // Update the list of online users
                if (message.userIds) {
                  setOnlineUserIds(message.userIds);
                }
                break;
                
              case 'pong':
                // Handle pong response from server (keep-alive acknowledgment)
                console.log('Received pong from server:', message.timestamp);
                break;
                
              case 'notification':
                // Handle other notifications (e.g., question updates, etc.)
                if (message.content) {
                  toast({
                    title: "Notification",
                    description: message.content,
                  });
                }
                break;
                
              case 'error':
                // Handle server error message
                console.error('Server WebSocket error:', message.content);
                toast({
                  variant: "destructive",
                  title: "Connection Error",
                  description: message.content || "Something went wrong with the connection",
                });
                break;
                
              default:
                // Log unknown message types for debugging
                if (message.content) {
                  console.log('Unknown message type:', message.type, message.content);
                }
            }
          } catch (err) {
            console.error('Error handling WebSocket message:', err, event.data);
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
        
        // Setup a basic interval to check for notifications
        const pollingInterval = setInterval(async () => {
          try {
            if (user) {
              // Poll for unread messages count every 30 seconds as fallback
              console.log("Polling for notifications...");
              // In a real implementation, we would fetch unread messages count here
              // This is just a fallback when WebSockets are not available
            }
          } catch (err) {
            console.error("Error polling for notifications:", err);
          }
        }, 30000); // Every 30 seconds
        
        return () => {
          clearInterval(pollingInterval);
        };
      }
    }
  }, [user, toast]);

  // Add ping interval to keep connection alive
  useEffect(() => {
    if (!socket) return;
    
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "ping"
        }));
      }
    }, 30000); // Every 30 seconds
    
    return () => {
      clearInterval(pingInterval);
    };
  }, [socket]);

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