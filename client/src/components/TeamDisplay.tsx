import { Crown, Edit2, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";

type TeamDisplayMember = {
  userId: number;
  username: string;
  role: "captain" | "member";
};

type TeamDisplayTeam = {
  id: string;
  name: string;
  captainId: number;
  members: TeamDisplayMember[];
  teamSide?: "A" | "B";
};

type TeamDisplayProps = {
  team: TeamDisplayTeam;
  currentUserId?: number;
  onReady?: () => void;
  onUpdateTeamName?: (teamId: string, newName: string) => Promise<void>;
  onLeaveTeam?: (teamId: string) => void;
  title?: string;
  isUserTeam?: boolean;
  isReady?: boolean;
};

const TeamDisplay = ({
  team,
  currentUserId,
  onReady,
  onUpdateTeamName,
  onLeaveTeam,
  title,
  isUserTeam,
  isReady,
}: TeamDisplayProps) => {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [editedName, setEditedName] = useState(team.name);
  const [isUpdating, setIsUpdating] = useState(false);

  const isCaptain = currentUserId ? team.captainId === currentUserId : false;
  const canReady = Boolean(
    onReady &&
    isUserTeam &&
    isCaptain
  );

  const handleOpenEdit = () => {
    setEditedName(team.name);
    setShowEditDialog(true);
  };

  const handleCloseEdit = () => {
    setEditedName(team.name);
    setShowEditDialog(false);
  };

  const handleSaveEdit = async () => {
    if (!editedName.trim() || !onUpdateTeamName) return;
    
    setIsUpdating(true);
    try {
      await onUpdateTeamName(team.id, editedName.trim());
      setShowEditDialog(false);
    } catch (error) {
      console.error("Failed to update team name:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border space-y-4">
      <div className="space-y-3">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {title && (
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {title}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {team.name}
                </h3>
                {isCaptain && onUpdateTeamName && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleOpenEdit}
                    className="h-7 w-7 p-0 hover:bg-gray-100 flex-shrink-0"
                    title="Edit team name"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {isUserTeam && (
                  <span className="text-sm text-gray-500">(Your Team)</span>
                )}
                {isReady && (
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 border border-green-300">
                    Ready
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {canReady && (
              <Button
                onClick={onReady}
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
              >
                Ready to Play
              </Button>
            )}
            {isUserTeam && onLeaveTeam && (
              <Button
                onClick={() => setShowLeaveDialog(true)}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 w-full sm:w-auto"
                title="Leave team and start over"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Leave Team</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-500 mb-2">Team Members</h4>
        <ul className="space-y-2">
          {team.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between p-2 bg-gray-50 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{member.username}</span>
                {member.role === "captain" && (
                  <Crown className="h-4 w-4 text-yellow-500" />
                )}
              </div>
              <span className="text-sm text-gray-500">
                {member.role === "captain" ? "Captain" : "Member"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Edit Team Name Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder="Enter team name"
              disabled={isUpdating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editedName.trim()) handleSaveEdit();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseEdit}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isUpdating || !editedName.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {isUpdating ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Team Confirmation Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-red-600" />
              Leave Team?
            </DialogTitle>
            <DialogDescription>
              {isCaptain
                ? "As the captain, leaving will disband the entire team. All members will be removed."
                : "You will be removed from this team and can join or create a different one."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to leave <strong>{team.name}</strong>?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onLeaveTeam?.(team.id);
                setShowLeaveDialog(false);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isCaptain ? "Disband Team" : "Leave Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamDisplay;