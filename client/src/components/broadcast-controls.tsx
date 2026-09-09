import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// The Go Live button. The stream is produced by the mixer's director, which
// follows the live match; this card shows whether it is on air and flips it.
// Everything goes through this server (/api/broadcast), which holds the
// address of the director; the browser never talks to the mixer directly.
type BroadcastState = {
  configured?: boolean;
  following?: boolean;
  program?: string | null;
  match?: string | null;
  error?: string | null;
  stream_url?: string;
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

  const s = state.data;
  const onAir = !!s?.following;
  const notConfigured = s && s.configured === false;
  const label = state.isLoading
    ? "Checking the stream"
    : notConfigured
      ? "Streaming is not configured on this server"
      : s?.error
        ? `Director: ${s.error}`
        : onAir
          ? s?.program === "match"
            ? "On air: the live match"
            : s?.program
              ? `On air: ${s.program}`
              : "On air, waiting for a match"
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
      </CardContent>
    </Card>
  );
}
