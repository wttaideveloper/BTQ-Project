import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// The Go Live button. The stream is produced by the mixer's director, which
// follows the live match; this card shows whether it is on air and flips it.
// Everything goes through this server (/api/broadcast), which holds the
// address of the director; the browser never talks to the mixer directly.
type LiveEvent = { id: string; kind: string; title: string; watchPath: string; startedAt: string | null };

type BroadcastState = {
  configured?: boolean;
  /** The mixer has polled us recently. It runs elsewhere and checks in. */
  connected?: boolean;
  following?: boolean;
  program?: string | null;
  match?: string | null;
  error?: string | null;
  stream_url?: string;
  /** The admin's RTMP destination with its stream key masked, or "". */
  destination?: string;
  outputs?: { id: string; host?: string | null; state?: string; reconnects?: number; builtin?: boolean }[];
  /** Everything live and streamable right now, newest first. */
  live?: LiveEvent[];
};

export function BroadcastControls() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const state = useQuery<BroadcastState>({
    queryKey: ["/api/broadcast"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/broadcast");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const flip = useMutation({
    mutationFn: async (action: "go-live" | "off-air") => {
      const r = await apiRequest("POST", `/api/broadcast/${action}`, {});
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `${r.status}`);
      }
      return action;
    },
    onSuccess: (action) => {
      toast({
        title: action === "go-live" ? "Going live" : "Off air",
        description:
          action === "go-live"
            ? "The live match goes on the stream as soon as it is up; the next match follows automatically."
            : "The stream shows black until you go live again.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/broadcast"] });
    },
    onError: (e: Error) => toast({ title: "Broadcast", description: e.message, variant: "destructive" }),
  });

  // The RTMP destination. Typed here, sent once on Save; the server never
  // returns the key, so the field is empty again after a save and the masked
  // address is shown beside it.
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setUrl("");
  }, [editing]);
  const setDestination = useMutation({
    mutationFn: async (next: string) => {
      const r = await apiRequest("POST", "/api/broadcast/destination", { url: next });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `${r.status}`);
      }
      return next;
    },
    onSuccess: (next) => {
      toast({
        title: next ? "Destination saved" : "Destination removed",
        description: next
          ? "The stream now also goes to that RTMP server. The Watch page keeps working as before."
          : "The stream goes only to the built-in server behind the Watch page.",
      });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/broadcast"] });
    },
    onError: (e: Error) => toast({ title: "Destination", description: e.message, variant: "destructive" }),
  });

  const s = state.data;
  const onAir = !!s?.following;
  const destOut = s?.outputs?.find((o) => !o.builtin);
  const destState =
    destOut?.state === "live"
      ? "connected"
      : destOut?.state === "reconnecting" || destOut?.state === "connecting"
        ? destOut.state
        : destOut?.state === "failed"
          ? "failed"
          : null;
  const notConfigured = s && s.configured === false;
  const live = s?.live ?? [];
  const onAirTitle = live.find((e) => e.id === s?.match)?.title;
  const label = state.isLoading
    ? "Checking the stream"
    : notConfigured
      ? "Streaming is not configured on this server"
      : s?.connected === false
        ? "The mixer has not checked in. It polls every few seconds; if this persists it is not running."
        : s?.error
          ? `Mixer: ${s.error}`
          : onAir
            ? onAirTitle
              ? `On air: ${onAirTitle}`
              : s?.program
                ? `On air: ${s.program}`
                : "On air, waiting for something to stream"
            : "Off air";

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${onAir ? "bg-red-500 animate-pulse" : "bg-slate-300"}`}
            aria-hidden
          />
          Live stream
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => flip.mutate("go-live")}
          disabled={flip.isPending || !!notConfigured || onAir}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Go Live
        </Button>
        <Button
          variant="outline"
          onClick={() => flip.mutate("off-air")}
          disabled={flip.isPending || !!notConfigured || !onAir}
        >
          Off Air
        </Button>
        {s?.stream_url && (
          <a href={s.stream_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
            Watch the stream
          </a>
        )}
        {!notConfigured && (
          <div className="basis-full text-xs text-slate-500">
            {live.length === 0
              ? "Nothing is live right now. The stream shows the championship page until something starts."
              : `Live now: ${live.map((e) => e.title).join(", ")}`}
          </div>
        )}
        {!notConfigured && (
          <div className="basis-full mt-2 pt-3 border-t border-slate-100">
            <div className="text-sm font-medium text-slate-700">RTMP destination</div>
            <p className="text-xs text-slate-500 mb-2">
              The stream always goes to the built-in server behind the Watch page. Add the RTMP address of
              YouTube, Facebook or any other server, with its stream key (rtmp://host/app/key), to send it there
              as well.
            </p>
            {editing ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setDestination.mutate(url.trim());
                }}
              >
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="rtmp://a.rtmp.youtube.com/live2/your-stream-key"
                  className="max-w-md font-mono text-sm"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={setDestination.isPending || !url.trim()}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {s?.destination ? (
                  <>
                    <code className="px-2 py-1 rounded bg-slate-100 text-xs">{s.destination}</code>
                    {destState && (
                      <span
                        className={
                          destState === "connected"
                            ? "text-green-700"
                            : destState === "failed"
                              ? "text-red-600"
                              : "text-amber-600"
                        }
                      >
                        {destState}
                        {destOut?.reconnects ? ` (${destOut.reconnects} reconnects)` : ""}
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setDestination.isPending}
                      onClick={() => setDestination.mutate("")}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">None: only the Watch page.</span>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Add destination
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
