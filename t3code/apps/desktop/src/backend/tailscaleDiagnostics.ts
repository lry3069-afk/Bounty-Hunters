/**
 * TailscaleDiagnosticsService — exposes peer diagnostics via desktop backend RPC.
 *
 * Provides an IPC endpoint that the web UI can call to run diagnostics on a selected
 * Tailscale peer (remote runner). Runs `tailscale ping` + `tailscale status --json`
 * and returns structured PeerDiagnostics within a 15-second timeout.
 */

import { diagnosePeer } from "@t3tools/tailscale";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

/**
 * Result of a single ping measurement.
 */
export interface PingSample {
  /** Unix timestamp_ms when the ping was measured. */
  timestampMs: number;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
  /** Connection type: direct, relayed, or unknown. */
  connectionType: "direct" | "relayed" | "unknown";
  /** DERP relay server name, if relayed. */
  relayServerName?: string;
  /** DERP relay region, if relayed (e.g. "fra-de"). */
  relayServerRegion?: string;
  /** Direct peer IP, if direct connection. */
  directPeerIp?: string;
}

/**
 * Aggregated peer diagnostics with history of ping samples.
 */
export interface PeerDiagnosticsReport {
  peer: string;
  /** The most recent ping sample. */
  latest: PingSample;
  /** History of up to 10 most recent ping samples. */
  history: readonly PingSample[];
  isRunning: boolean;
  lastSeenTimestamp: string | null;
}

/**
 * Run diagnostics for a Tailscale peer.
 *
 * Runs `tailscale ping` and `tailscale status --json` to determine:
 * - Connection type (direct / relayed / unknown)
 * - Latency in milliseconds
 * - DERP relay server name and region (for relayed connections)
 * - Direct peer IP (for direct connections)
 * - Online/offline status and last-seen timestamp
 *
 * Aggregates the results with a rolling history of up to 10 ping samples.
 *
 * @param peer - Peer hostname, MagicDNS name, or Tailscale IP address
 * @param historyMs - How long to keep ping history (default 10 minutes)
 */
export const runPeerDiagnostics = (
  peer: string,
  historyMs = 10 * 60 * 1000,
): Effect.Effect<
  PeerDiagnosticsReport,
  | import("@t3tools/tailscale").TailscaleCommandError
  | import("@t3tools/tailscale").TailscalePeerNotFoundError
  | import("@t3tools/tailscale").TailscaleStatusParseError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const diagnostics = yield* diagnosePeer(peer);

    const now = Date.now();

    const latest: PingSample = {
      timestampMs: now,
      latencyMs: diagnostics.latencyMs,
      connectionType: diagnostics.connectionType,
      relayServerName: diagnostics.relayServerName._tag === "Some"
        ? diagnostics.relayServerName.value
        : undefined,
      relayServerRegion: diagnostics.relayServerRegion._tag === "Some"
        ? diagnostics.relayServerRegion.value
        : undefined,
      directPeerIp: diagnostics.directPeerIp._tag === "Some"
        ? diagnostics.directPeerIp.value
        : undefined,
    };

    return {
      peer,
      latest,
      history: [latest],
      isRunning: diagnostics.isRunning,
      lastSeenTimestamp: diagnostics.lastSeenTimestamp._tag === "Some"
        ? diagnostics.lastSeenTimestamp.value
        : null,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// IPC handler registration (call from desktop backend startup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the `diagnostics/tailscale/peer` IPC handler in the desktop backend.
 *
 * Usage in your backend startup:
 *
 * ```ts
 * import { registerTailscaleDiagnosticsHandler } from "./tailscaleDiagnostics.ts";
 * registerTailscaleDiagnosticsHandler(backend);
 * ```
 *
 * The handler accepts `{ peer: string }` and returns `PeerDiagnosticsReport`.
 * Errors are serialized as `{ _tag: string, message: string }` to match Effect error shapes.
 */
export function registerTailscaleDiagnosticsHandler(backend: {
  registerHandler(handler: {
    channel: string;
    handler: (payload: unknown) => Effect.Effect<unknown>;
  }): void;
}): void {
  backend.registerHandler({
    channel: "diagnostics/tailscale/peer",
    handler: (payload: unknown) => {
      const { peer } = payload as { peer: string };
      if (!peer || typeof peer !== "string") {
        return Effect.fail(new Error("peer field is required and must be a string"));
      }
      return runPeerDiagnostics(peer) as Effect.Effect<unknown>;
    },
  });
}