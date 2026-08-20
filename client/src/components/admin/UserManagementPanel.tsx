import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { adminFetch, getQueryFn } from "@/lib/queryClient";
import { RefreshCw, Search, Users, Download } from "lucide-react";
import { buildUsersCsv, downloadCsv } from "@/lib/csv-export";

type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  profileImage: string | null;
  bio: string | null;
  country: string | null;
  isAdmin: boolean;
  isEmailVerified: boolean | null;
  isOnline: boolean | null;
  isInTeamBattle: boolean | null;
  lastSeen: string | null;
  lastLoginAt: string | null;
  totalGames: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
};

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
  activeClassName,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClassName: string;
}) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? activeClassName
          : "bg-gray-50 text-gray-600 border-gray-200"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

export function UserManagementPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: users = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<AdminUser[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 10000,
  });

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const haystack = [
        user.fullName,
        user.username,
        user.email,
        user.phone,
        user.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [users, searchQuery]);

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fallbackFilename = `faithiq-users-${dateStamp}.csv`;

    try {
      const res = await adminFetch("/api/admin/users/export");

      if (res.status === 401) {
        return;
      }

      if (res.ok) {
        const csv = await res.text();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        downloadCsv(csv, match?.[1] ?? fallbackFilename);
        return;
      }

      if (filteredUsers.length > 0) {
        downloadCsv(buildUsersCsv(filteredUsers), fallbackFilename);
      }
    } catch {
      if (filteredUsers.length > 0) {
        downloadCsv(buildUsersCsv(filteredUsers), fallbackFilename);
      }
    } finally {
      setIsExporting(false);
    }
  }, [filteredUsers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, username, email, phone..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={isExporting || (filteredUsers.length === 0 && !isLoading)}
            className="flex items-center gap-2"
          >
            <Download className={`h-4 w-4 ${isExporting ? "animate-pulse" : ""}`} />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Users className="h-4 w-4" />
            <span className="font-medium">{filteredUsers.length} registered users</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Loading users...</div>
        ) : isError ? (
          <div className="p-10 text-center text-red-500">
            Failed to load users. Please try again.
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profile</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Online</TableHead>
                  <TableHead>Team Battle</TableHead>
                  <TableHead>Stats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <UserAvatar
                        profileImage={user.profileImage}
                        fullName={user.fullName}
                        username={user.username}
                        className="h-10 w-10"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">
                        {user.fullName || "—"}
                      </div>
                      {user.country && (
                        <div className="text-xs text-gray-500">{user.country}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{user.username}</div>
                      {user.isAdmin && (
                        <Badge className="mt-1 bg-purple-100 text-purple-700 hover:bg-purple-100">
                          Admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{user.email || "—"}</div>
                      {user.isEmailVerified ? (
                        <span className="text-xs text-green-600">Verified</span>
                      ) : (
                        <span className="text-xs text-gray-400">Unverified</span>
                      )}
                    </TableCell>
                    <TableCell>{user.phone || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        active={!!user.isOnline}
                        activeLabel="Online"
                        inactiveLabel="Offline"
                        activeClassName="bg-green-50 text-green-700 border-green-200"
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        active={!!user.isInTeamBattle}
                        activeLabel="In Lobby"
                        inactiveLabel="Not in Lobby"
                        activeClassName="bg-blue-50 text-blue-700 border-blue-200"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-700 whitespace-nowrap">
                        {user.totalGames ?? 0} games
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {user.wins ?? 0}W / {user.losses ?? 0}L / {user.draws ?? 0}D
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserManagementPanel;
