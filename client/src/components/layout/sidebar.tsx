import { useLocation } from "wouter";
import {
  Home,
  MessageSquare,
  Users,
  Tag,
  HelpCircle,
  CheckSquare,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location, navigate] = useLocation();

  // Get messages for notification count
  const { data: chats } = useQuery({
    queryKey: ['/api/messages/chats'],
  });

  // Calculate unread messages
  const unreadCount = chats?.reduce((count, chat) => count + chat.unreadCount, 0) || 0;

  const navigationItems = [
    { 
      label: "Home", 
      icon: <Home className="h-5 w-5 mr-3" />, 
      path: "/" 
    },
    { 
      label: "Questions", 
      icon: <HelpCircle className="h-5 w-5 mr-3" />, 
      path: "/questions" 
    },
    { 
      label: "Tags", 
      icon: <Tag className="h-5 w-5 mr-3" />, 
      path: "/tags" 
    },
    { 
      label: "Users", 
      icon: <Users className="h-5 w-5 mr-3" />, 
      path: "/users" 
    },
    { 
      label: "Messages", 
      icon: <MessageSquare className="h-5 w-5 mr-3" />, 
      path: "/messages",
      badge: unreadCount > 0 ? unreadCount : undefined
    },
  ];

  const userActivityItems = [
    { 
      label: "My Questions", 
      icon: <HelpCircle className="h-5 w-5 mr-3" />, 
      path: "/my-questions" 
    },
    { 
      label: "My Answers", 
      icon: <CheckSquare className="h-5 w-5 mr-3" />, 
      path: "/my-answers" 
    },
    { 
      label: "Following", 
      icon: <UserPlus className="h-5 w-5 mr-3" />, 
      path: "/following" 
    },
  ];

  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-20" 
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-64 bg-white dark:bg-card border-r border-border transform transition-transform duration-200 ease-in-out z-20 pt-20 lg:pt-20 lg:translate-x-0",
          {
            "translate-x-0": isOpen,
            "-translate-x-full": !isOpen,
          }
        )}
      >
        <div className="p-4">
          <nav className="space-y-1">
            {navigationItems.map((item) => (
              <Button
                key={item.path}
                variant="ghost"
                className={cn("w-full justify-start", {
                  "bg-primary/10 text-primary": isActive(item.path),
                })}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <Badge variant="destructive" className="ml-auto">
                    {item.badge > 9 ? "9+" : item.badge}
                  </Badge>
                )}
              </Button>
            ))}
            
            <Separator className="my-4" />
            
            <h3 className="text-sm font-medium text-muted-foreground px-3 mb-2">
              My Activity
            </h3>
            
            {userActivityItems.map((item) => (
              <Button
                key={item.path}
                variant="ghost"
                className={cn("w-full justify-start", {
                  "bg-primary/10 text-primary": isActive(item.path),
                })}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </Button>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
