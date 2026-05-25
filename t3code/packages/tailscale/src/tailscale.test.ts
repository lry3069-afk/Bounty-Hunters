import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  buildTailscaleHttpsBaseUrl,
  diagnosePeer,
  disableTailscaleServe,
  ensureTailscaleServe,
  isTailscaleIpv4Address,
  parseTailscaleMagicDnsName,
  parseTailscaleStatus,
  readTailscaleStatus,
} from "./tailscale.ts";

const encoder = new TextEncoder();

const tailscaleStatusJson = `{"Self":{"DNSName":"desktop.tail.ts.net.","TailscaleIPs":["100.100.100.100","fd7a:115c:a1e0::1","192.168.1.20"]}}`;
const tailscaleStatusWithSingleIpJson = `{"Self":{"DNSName":"desktop.tail.ts.net.","TailscaleIPs":["100.90.1.2"]}}`;
const tailscaleStatusWithPeersJson = JSON.stringify({
  Self: { DNSName: "desktop.tail.ts.net.", TailscaleIPs: ["100.100.100.100"] },
  Peer: {
    "runner-1": {
      DNSName: "runner-1.tail.ts.net.",
      TailscaleIPs: ["100.64.1.1"],
      Online: true,
      LastSeen: "2026-05-25T10:30:00Z",
      Relay: "fra-1",
    },
    "runner-2": {
      DNSName: "runner-2.tail.ts.net.",
      TailscaleIPs: ["100.64.1.2"],
      Online: false,
      LastSeen: "2026-05-24T08:00:00Z",
      Relay: "",
    },
  },
});

function mockHandle(result: { stdout?: string; stderr?: string; code?: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code ?? 0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout ?? "")),
    stderr: Stream.make(encoder.encode(result.stderr ?? "")),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (
    command: string,
    args: ReadonlyArray<string>,
  ) => { stdout?: string; stderr?: string; code?: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((cmd) => {
      const command = cmd as unknown as { readonly command: string; readonly args: ReadonlyArray<string> };
      return Effect.succeed(mockHandle(handler(command.command, command.args)));
    }),
  );
}

describe("tailscale", () => {
  describe("isTailscaleIpv4Address", () => {
    it.effect("detects Tailnet IPv4 addresses", () =>
      Effect.sync(() => {
        assert.equal(isTailscaleIpv4Address("100.64.0.1"), true);
        assert.equal(isTailscaleIpv4Address("100.127.255.254"), true);
        assert.equal(isTailscaleIpv4Address("100.128.0.1"), false);
        assert.equal(isTailscaleIpv4Address("192.168.1.44"), false);
        assert.equal(isTailscaleIpv4Address("10.0.0.1"), false);
        assert.equal(isTailscaleIpv4Address("invalid"), false);
      }),
    );
  });

  describe("parseTailscaleMagicDnsName", () => {
    it.effect("parses MagicDNS names from tailscale status", () =>
      Effect.gen(function* () {
        const dnsName = yield* parseTailscaleMagicDnsName(tailscaleStatusJson);
        assert.equal(dnsName, "desktop.tail.ts.net");
        assert.equal(yield* parseTailscaleMagicDnsName("{}"), null);
        assert.equal(yield* parseTailscaleMagicDnsName('{"Self":{"DNSName":"host."}}'), "host");
      }),
    );
  });

  describe("parseTailscaleStatus", () => {
    it.effect("parses status facts", () =>
      Effect.gen(function* () {
        const status = yield* parseTailscaleStatus(tailscaleStatusJson);
        assert.deepEqual(status, {
          magicDnsName: "desktop.tail.ts.net",
          tailnetIpv4Addresses: ["100.100.100.100"],
        });
      }),
    );

    it.effect("filters out non-tailnet IPs", () =>
      Effect.gen(function* () {
        const status = yield* parseTailscaleStatus(tailscaleStatusJson);
        assert.equal(status.tailnetIpv4Addresses.includes("192.168.1.20"), false);
      }),
    );

    it.effect("handles empty Peer map", () =>
      Effect.gen(function* () {
        const status = yield* parseTailscaleStatus('{"Self":{"DNSName":"test.tail.ts.net.","TailscaleIPs":["100.64.1.1"]}}');
        assert.equal(status.magicDnsName, "test.tail.ts.net");
        assert.deepEqual(status.tailnetIpv4Addresses, ["100.64.1.1"]);
      }),
    );
  });

  describe("buildTailscaleHttpsBaseUrl", () => {
    it.effect("builds clean HTTPS base URLs", () =>
      Effect.sync(() => {
        assert.equal(
          buildTailscaleHttpsBaseUrl({ magicDnsName: "desktop.tail.ts.net" }),
          "https://desktop.tail.ts.net/",
        );
        assert.equal(
          buildTailscaleHttpsBaseUrl({ magicDnsName: "desktop.tail.ts.net", servePort: 8443 }),
          "https://desktop.tail.ts.net:8443/",
        );
      }),
    );
  });

  describe("readTailscaleStatus", () => {
    it.effect("reads tailscale status through the process spawner service", () => {
      const layer = mockSpawnerLayer((command, args) => {
        assert.equal(command, "tailscale");
        assert.deepEqual(args, ["status", "--json"]);
        return { stdout: tailscaleStatusWithSingleIpJson };
      });

      return Effect.gen(function* () {
        const status = yield* readTailscaleStatus.pipe(Effect.provide(layer));
        assert.deepEqual(status, {
          magicDnsName: "desktop.tail.ts.net",
          tailnetIpv4Addresses: ["100.90.1.2"],
        });
      });
    });
  });

  describe("ensureTailscaleServe", () => {
    it.effect("configures tailscale serve through the process spawner service", () => {
      const layer = mockSpawnerLayer((command, args) => {
        assert.equal(command, "tailscale");
        assert.deepEqual(args, ["serve", "--bg", "--https=8443", "http://127.0.0.1:13773"]);
        return {};
      });

      return ensureTailscaleServe({ localPort: 13773, servePort: 8443 }).pipe(Effect.provide(layer));
    });
  });

  describe("disableTailscaleServe", () => {
    it.effect("disables tailscale serve through the process spawner service", () => {
      const commands: { readonly command: string; readonly args: ReadonlyArray<string> }[] = [];
      const layer = mockSpawnerLayer((command, args) => {
        commands.push({ command, args });
        assert.equal(command, "tailscale");
        assert.deepEqual(args, ["serve", "--https=8443", "off"]);
        return {};
      });

      return Effect.gen(function* () {
        yield* disableTailscaleServe({ servePort: 8443 }).pipe(Effect.provide(layer));
        assert.deepEqual(commands, [{ command: "tailscale", args: ["serve", "--https=8443", "off"] }]);
      });
    });
  });

  describe("diagnosePeer", () => {
    it.effect("parses direct ping output", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return {
              stdout: "100.64.1.1: connected to 100.64.1.1:       12.345ms\n100.64.1.1: pong\n",
              code: 0,
            };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("100.64.1.1").pipe(Effect.provide(layer));
        assert.equal(result.peer, "100.64.1.1");
        assert.equal(result.connectionType, "direct");
        assert.equal(result.latencyMs, 12.345);
        assert.deepEqual(result.directPeerIp, Option.some("100.64.1.1"));
        assert.deepEqual(result.relayServerName, Option.none());
      }),
    );

    it.effect("parses relayed ping output with DERP server", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return {
              stdout: "100.64.1.1: connected via relay fra-1:       45.678ms\n100.64.1.1: pong\n",
              code: 0,
            };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("runner-1.tail.ts.net.").pipe(Effect.provide(layer));
        assert.equal(result.connectionType, "relayed");
        assert.equal(result.latencyMs, 45.678);
        assert.deepEqual(result.relayServerName, Option.some("fra-1"));
        assert.deepEqual(result.relayServerRegion, Option.some("fra-1"));
      }),
    );

    it.effect("reports peer online status and lastSeen from status JSON", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return { stdout: "100.64.1.1: connected to 100.64.1.1:       5.0ms\n", code: 0 };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("100.64.1.1").pipe(Effect.provide(layer));
        assert.equal(result.isRunning, true);
        assert.deepEqual(result.lastSeenTimestamp, Option.some("2026-05-25T10:30:00Z"));
      }),
    );

    it.effect("reports offline peer", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return { stdout: "100.64.1.2: connected to 100.64.1.2:       8.0ms\n", code: 0 };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("100.64.1.2").pipe(Effect.provide(layer));
        assert.equal(result.isRunning, false);
        assert.deepEqual(result.lastSeenTimestamp, Option.some("2026-05-24T08:00:00Z"));
      }),
    );

    it.effect("handles unknown connection type gracefully", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return { stdout: "100.64.1.1: no reply yet\n", code: 0 };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("100.64.1.1").pipe(Effect.provide(layer));
        assert.equal(result.connectionType, "unknown");
      }),
    );

    it.effect("handles zero latency", () =>
      Effect.gen(function* () {
        const layer = mockSpawnerLayer((command, args) => {
          if (args[0] === "ping") {
            return { stdout: "100.64.1.1: connected to 100.64.1.1:       0ms\n", code: 0 };
          }
          if (args[0] === "status") {
            return { stdout: tailscaleStatusWithPeersJson };
          }
          return { stdout: "{}" };
        });

        const result = yield* diagnosePeer("100.64.1.1").pipe(Effect.provide(layer));
        assert.equal(result.latencyMs, 0);
      }),
    );
  });
});