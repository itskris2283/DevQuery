import { formatDistanceToNow } from "date-fns";
import { Message, User } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type MessageListProps = {
  messages: Message[];
  currentUser: Omit<User, "password"> | null;
  otherUser: Omit<User, "password">;
};

export default function MessageList({ messages, currentUser, otherUser }: MessageListProps) {
  // Group messages by date for better visual organization
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    
    messages.forEach(message => {
      const messageDate = new Date(message.createdAt).toLocaleDateString();
      
      if (messageDate !== currentDate) {
        groups.push({ date: messageDate, messages: [message] });
        currentDate = messageDate;
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });
    
    return groups;
  };
  
  const messageGroups = groupMessagesByDate(messages);

  // Helper to format time from date
  const formatMessageTime = (date: string | Date) => {
    const messageDate = new Date(date);
    return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Should we show the sender's avatar? (when messages are grouped)
  const shouldShowAvatar = (messages: Message[], index: number) => {
    if (index === 0) return true;
    
    const currentMessage = messages[index];
    const previousMessage = messages[index - 1];
    
    return currentMessage.senderId !== previousMessage.senderId ||
           // If more than 5 minutes have passed, show avatar again
           new Date(currentMessage.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() > 5 * 60 * 1000;
  };

  return (
    <div className="space-y-6">
      {messageGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-4">
          <div className="relative flex justify-center">
            <span className="bg-muted px-2 py-0.5 rounded-full text-xs text-muted-foreground">
              {new Date(group.date).toLocaleDateString(undefined, { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
              })}
            </span>
          </div>
          
          {group.messages.map((message, messageIndex) => {
            const isCurrentUser = message.senderId === currentUser?.id;
            const showAvatar = !isCurrentUser && shouldShowAvatar(group.messages, messageIndex);
            
            return (
              <div 
                key={message.id} 
                className={cn("flex items-end", {
                  "justify-end": isCurrentUser,
                  "justify-start": !isCurrentUser,
                })}
              >
                {!isCurrentUser && showAvatar && (
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={otherUser.avatarUrl || ''} alt={otherUser.username} />
                    <AvatarFallback>{otherUser.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                
                {!isCurrentUser && !showAvatar && <div className="w-6 mr-2" />}
                
                <div 
                  className={cn("max-w-xs lg:max-w-md px-4 py-2 rounded-lg", {
                    "bg-primary text-primary-foreground": isCurrentUser,
                    "bg-muted": !isCurrentUser,
                  })}
                >
                  <p className="text-sm">{message.content}</p>
                  <span 
                    className={cn("text-xs mt-1 block", {
                      "text-primary-foreground/70": isCurrentUser,
                      "text-muted-foreground": !isCurrentUser,
                    })}
                  >
                    {formatMessageTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
