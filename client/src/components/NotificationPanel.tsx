import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { setupGameSocket, markNotificationAsRead, onNotification } from '@/lib/socket';
import {
  Bell,
  CheckCircle,
  Loader2,
  Trophy,
  Users,
  X
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  challengeId?: string;
  createdAt: Date;
}

export function NotificationPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Set up socket connection when component mounts
  useEffect(() => {
    if (user?.id) {
      const socket = setupGameSocket(user.id);
      
      // Setup notification listener
      const unsubscribe = onNotification((notification) => {
        // Refresh notifications when a new one is received
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        
        // Show toast notification
        toast({
          title: 'New Notification',
          description: notification.message,
        });
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [user?.id, queryClient, toast]);

  // Query for user's notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/notifications');
      return await res.json() as Notification[];
    },
    enabled: !!user,
  });

  // Mutation for marking a notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      // API request
      await apiRequest('PATCH', `/api/notifications/${notificationId}`);
      
      // Also send to socket for real-time updates
      markNotificationAsRead(notificationId);
      
      return { success: true };
    },
    onSuccess: () => {
      // Invalidate notifications query to reflect updated status
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Mark as Read',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting a notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiRequest('DELETE', `/api/notifications/${notificationId}`);
      return { success: true };
    },
    onSuccess: () => {
      // Invalidate notifications query to reflect updated status
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Delete Notification',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Count of unread notifications
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'challenge_received': return <Users className="h-4 w-4 text-blue-500" />;
      case 'challenge_completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'challenge_declined': return <X className="h-4 w-4 text-red-500" />;
      case 'challenge_expired': return <Loader2 className="h-4 w-4 text-yellow-500" />;
      case 'challenge_result': return <Trophy className="h-4 w-4 text-yellow-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = () => {
    const unreadNotifications = notifications?.filter(n => !n.read) || [];
    Promise.all(
      unreadNotifications.map(notification => 
        markAsReadMutation.mutate(notification.id)
      )
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 px-1 min-w-[1.2rem] h-5 flex items-center justify-center">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} disabled={markAsReadMutation.isPending}>
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px] p-4">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : notifications && notifications.length > 0 ? (
            notifications.map(notification => (
              <div key={notification.id} className="mb-4">
                <div className={`flex items-start gap-2 p-2 rounded-md ${notification.read ? 'opacity-70' : 'bg-accent'}`}>
                  <div className="mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                    {notification.challengeId && (
                      <div className="pt-1">
                        <Button size="sm" variant="secondary" asChild className="text-xs h-7 px-2">
                          <a href={`/play?mode=challenge&id=${notification.challengeId}`}>
                            View Challenge
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {!notification.read && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        disabled={markAsReadMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6 text-destructive hover:text-destructive" 
                      onClick={() => deleteNotificationMutation.mutate(notification.id)}
                      disabled={deleteNotificationMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Separator className="my-2" />
              </div>
            ))
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No notifications
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}