/**
 * Championship pre-match kickoff uses the existing Team Battle ready columns.
 * Arrival (`captains_ready`) is presence only and must not substitute for READY.
 */
export function championshipDbReadyAllowsStart(
  state: { teamAReady?: boolean; teamBReady?: boolean } | null | undefined,
): boolean {
  return !!state?.teamAReady && !!state?.teamBReady;
}
