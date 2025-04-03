import { useNotifications } from "./notification-provider";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";

export function NotificationIndicator() {
  const { unreadCount, resetUnreadCount } = useNotifications();

  return (
    <Link
      href="/messages"
      onClick={resetUnreadCount}
      className="relative inline-flex items-center"
    >
      <MessageSquare className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </Badge>
      )}
    </Link>
  );
}