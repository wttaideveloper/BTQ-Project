import { useMemo, useState } from "react";
import { Check, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface PickerPlayer {
  id: number;
  username?: string | null;
  fullName?: string | null;
  email?: string | null;
}

export const playerLabel = (player: PickerPlayer) => player.fullName?.trim() || player.username || `Player ${player.id}`;
const playerSubtitle = (player: PickerPlayer) =>
  player.email?.trim() || (player.fullName?.trim() ? player.username ?? "" : "");

/**
 * Case-insensitive local filter over the player list the panel has already
 * loaded. No request is made for searching - the caller passes the same
 * filtered candidate list it always used, so every assignment rule (players
 * already on a team stay hidden, the captain is excluded from members) is
 * decided by the caller exactly as before.
 */
function useFiltered(players: PickerPlayer[], query: string) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return players;
    return players.filter(player =>
      [player.fullName, player.username, player.email]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle)),
    );
  }, [players, query]);
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <Input
        className="h-10 pl-9"
        type="search"
        aria-label={label}
        placeholder="Search players…"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}

const rowBase =
  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** Searchable single-select, used for the team captain. */
export function PlayerSearchSelect({
  players,
  value,
  onChange,
  emptyMessage = "No players found",
}: {
  players: PickerPlayer[];
  /** Selected player id as a string, matching the existing form state. */
  value: string;
  onChange: (id: string) => void;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useFiltered(players, query);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label="Search players to choose a captain" />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {filtered.map(player => {
              const selected = String(player.id) === value;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(String(player.id))}
                    className={`${rowBase} ${selected ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50"}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <User size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{playerLabel(player)}</span>
                      {playerSubtitle(player) && (
                        <span className="block truncate text-xs text-slate-500">{playerSubtitle(player)}</span>
                      )}
                    </span>
                    {selected && <Check size={16} className="shrink-0 text-blue-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Searchable multi-select with removable chips, used for additional members. */
export function PlayerMultiSelect({
  players,
  selectedIds,
  onToggle,
  emptyMessage = "No players found",
}: {
  players: PickerPlayer[];
  selectedIds: number[];
  onToggle: (id: number, next: boolean) => void;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useFiltered(players, query);
  const selected = players.filter(player => selectedIds.includes(player.id));

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label="Search players to add as members" />

      {selected.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {selected.map(player => (
            <li key={player.id}>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-medium text-blue-800">
                <span className="truncate">{playerLabel(player)}</span>
                <button
                  type="button"
                  onClick={() => onToggle(player.id, false)}
                  aria-label={`Remove ${playerLabel(player)}`}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {filtered.map(player => {
              const isSelected = selectedIds.includes(player.id);
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onToggle(player.id, !isSelected)}
                    className={`${rowBase} ${isSelected ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{playerLabel(player)}</span>
                      {playerSubtitle(player) && (
                        <span className="block truncate text-xs text-slate-500">{playerSubtitle(player)}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
