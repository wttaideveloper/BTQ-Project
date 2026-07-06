import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { onEvent } from "@/lib/socket";

/**
 * Global toast notifications for team battle / rapid fire invitations.
 * Mounted once per authenticated session so invitees are notified on any page.
 */
export function useTeamInvitationToasts(userId?: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const refreshInvitations = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-invitations"] });
      queryClient.refetchQueries({ queryKey: ["/api/team-invitations"] });
    };

    const offCaptainInvitation = onEvent(
      "team_captain_invitation_received",
      (data: { message?: string; inviterName?: string }) => {
        refreshInvitations();
        toast({
          title: "Team Captain Invitation",
          description:
            data.message ||
            `${data.inviterName || "A player"} invited you to captain the opposing team!`,
        });
      }
    );

    const offMemberInvitation = onEvent(
      "team_member_invitation_received",
      (data: { message?: string; inviterName?: string }) => {
        refreshInvitations();
        toast({
          title: "Team Invitation",
          description:
            data.message ||
            `You have been invited to join a team by ${data.inviterName || "a player"}`,
        });
      }
    );

    const offGenericInvitation = onEvent(
      "team_invitation_received",
      (data: { message?: string; inviterName?: string }) => {
        refreshInvitations();
        toast({
          title: "Team Invitation",
          description:
            data.message ||
            `You have been invited to join a team by ${data.inviterName || "a player"}`,
        });
      }
    );

    return () => {
      offCaptainInvitation();
      offMemberInvitation();
      offGenericInvitation();
    };
  }, [userId, toast, queryClient]);
}
