import { describe, expect, it } from "vitest";

import { deriveAuthClientMetadata, inferDeviceName } from "./utils.ts";

describe("deriveAuthClientMetadata", () => {
  it("labels Electron user agents as Electron instead of Chrome", () => {
    const metadata = deriveAuthClientMetadata({
      request: {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) t3code/0.0.15 Chrome/136.0.7103.93 Electron/36.3.2 Safari/537.36",
        },
        source: {
          remoteAddress: "::ffff:127.0.0.1",
        },
      } as never,
    });

    expect(metadata).toMatchObject({
      browser: "Electron",
      deviceType: "desktop",
      ipAddress: "127.0.0.1",
      os: "macOS",
    });
  });

  it("auto-populates device name from user-agent when label is not provided", () => {
    const metadata = deriveAuthClientMetadata({
      request: {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        },
        source: {},
      } as never,
    });

    expect(metadata.label).toBe("iPhone");
    expect(metadata.deviceType).toBe("mobile");
    expect(metadata.os).toBe("iOS");
    expect(metadata.browser).toBe("Safari");
  });

  it("prefers explicit label over inferred device name", () => {
    const metadata = deriveAuthClientMetadata({
      request: {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
        source: {},
      } as never,
      label: "My MacBook",
    });

    expect(metadata.label).toBe("My MacBook");
    expect(metadata.deviceType).toBe("desktop");
    expect(metadata.os).toBe("macOS");
  });
});

describe("inferDeviceName", () => {
  it("returns iPhone for iPhone user agents", () => {
    const result = inferDeviceName({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1",
      deviceType: "mobile",
      os: "iOS",
    });
    expect(result).toBe("iPhone");
  });

  it("returns iPad for iPad user agents", () => {
    const result = inferDeviceName({
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceType: "tablet",
      os: "iOS",
    });
    expect(result).toBe("iPad");
  });

  it("returns Android device model when brand is detected", () => {
    const result = inferDeviceName({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      deviceType: "mobile",
      os: "Android",
    });
    expect(result).toBe("Pixel 8 Pro");
  });

  it("returns Mac for desktop macOS without explicit model", () => {
    const result = inferDeviceName({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      deviceType: "desktop",
      os: "macOS",
    });
    expect(result).toBe("Mac");
  });

  it("returns Windows PC for Windows user agents", () => {
    const result = inferDeviceName({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      deviceType: "desktop",
      os: "Windows",
    });
    expect(result).toBe("Windows PC");
  });

  it("returns undefined when no device info is available", () => {
    const result = inferDeviceName({
      userAgent: undefined,
      deviceType: "unknown",
      os: undefined,
    });
    expect(result).toBeUndefined();
  });
});
