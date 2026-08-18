import { Input } from "@/components/ui/input";

/**
 * Team icon picker for the admin Championship panel.
 *
 * The value is the same emoji string the API has always stored
 * (`championship_teams.emoticon`), so existing teams keep their icon and no
 * migration is involved - the grid is only a faster way to choose one. The free
 * text field stays, so any emoji outside the grid (including one an existing
 * team already uses) can still be entered.
 */
const TEAM_ICONS = [
  "🏆", "🦁", "🔥", "⭐", "⚡", "🛡️",
  "🐯", "🦅", "🐺", "🦊", "👑", "💎",
  "⚔️", "🚀", "🌟", "🎯", "🏅", "👏",
  "❤️", "👍", "🕊️", "📖", "✝️", "🌿",
];

export function TeamIconPicker({
  value,
  onChange,
  id = "team-icon",
}: {
  value: string;
  onChange: (icon: string) => void;
  id?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-slate-50 text-2xl"
          aria-hidden="true"
        >
          {value || "🏆"}
        </span>
        <Input
          id={id}
          className="h-11 max-w-[10rem] text-xl"
          aria-label="Team icon"
          value={value}
          onChange={event => onChange(event.target.value)}
          maxLength={8}
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Choose a team icon"
        className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8"
      >
        {TEAM_ICONS.map(icon => {
          const selected = value === icon;
          return (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Team icon ${icon}`}
              onClick={() => onChange(icon)}
              className={`grid aspect-square place-items-center rounded-lg border text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selected
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
