import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { onEvent } from "@/lib/socket";

/**
 * Global toast notifications when a join request status changes for the current user.
 * Uses onEvent (no session guard) so requesters are notified even before they have a team session.
 */
export function useJoinRequestToasts(userId?: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const refreshJoinRequests = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-join-requests"] });
    };

    const offJoinRequestUpdated = onEvent("join_request_updated", (data: any) => {
      if (Number(data.requesterId) !== userId) return;

      refreshJoinRequests();

      if (data.status === "rejected") {
        toast({
          title: "Join Request Declined",
          description:
            data.message ||
            `${data.teamName || "The team"} declined your request to join.`,
          variant: "destructive",
        });
        return;
      }

      if (data.status === "expired") {
        toast({
          title: "Join Request Expired",
          description:
            data.message || "Your join request is no longer active.",
          variant: "destructive",
        });
        return;
      }

      if (data.status === "cancelled") {
        toast({
          title: "Join Request Cancelled",
          description: data.message || "Your join request was cancelled.",
        });
      }
    });

    return () => {
      offJoinRequestUpdated();
    };
  }, [userId, toast, queryClient]);
}
