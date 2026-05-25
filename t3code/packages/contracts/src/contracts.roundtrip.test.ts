import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import * as fc from "fast-check";

import {
  TrimmedString,
  TrimmedNonEmptyString,
  NonNegativeInt,
  PositiveInt,
  PortSchema,
  ThreadId,
  ProjectId,
  EnvironmentId,
  CommandId,
  EventId,
  MessageId,
  TurnId,
  AuthSessionId,
  ProviderItemId,
  RuntimeSessionId,
  RuntimeItemId,
  RuntimeRequestId,
  RuntimeTaskId,
  ApprovalRequestId,
  CheckpointRef,
} from "./baseSchemas.js";
import {
  ServerAuthPolicy,
  ServerAuthBootstrapMethod,
  AuthSessionRole,
  AuthClientMetadataDeviceType,
} from "./auth.js";
import {
  ExecutionEnvironmentPlatformOs,
  ExecutionEnvironmentPlatformArch,
  ExecutionEnvironmentPlatform,
  EnvironmentConnectionState,
} from "./environment.js";
import {
  EditorLaunchStyle,
  EditorId,
  LaunchEditorInput,
} from "./editor.js";
import {
  SourceControlProviderKind,
  ChangeRequestState,
  SourceControlRepositoryVisibility,
  SourceControlCloneProtocol,
} from "./sourceControl.js";
import {
  VcsDriverKind,
  VcsFreshnessSource,
} from "./vcs.js";
import {
  KeybindingCommand,
  KeybindingValue,
  KeybindingWhen,
  KeybindingRule,
  KeybindingsConfig,
  ResolvedKeybindingRule,
  ResolvedKeybindingsConfig,
  MAX_KEYBINDING_VALUE_LENGTH,
  MAX_KEYBINDING_WHEN_LENGTH,
} from "./keybindings.js";
import {
  ProviderOptionDescriptorType,
  BooleanProviderOptionDescriptor,
  SelectProviderOptionDescriptor,
  ProviderOptionDescriptor,
  ModelCapabilities,
} from "./model.js";
import {
  ProviderDriverKind,
  ProviderInstanceId,
} from "./providerInstance.js";
import {
  ServerProviderState,
  ServerProviderAuthStatus,
  ServerProviderAvailability,
} from "./server.js";
import {
  TimestampFormat,
  SidebarProjectSortOrder,
  SidebarThreadSortOrder,
  SidebarProjectGroupingMode,
  SidebarThreadPreviewCount,
  ClientSettingsSchema,
  ServerSettings,
  ServerSettingsPatch,
} from "./settings.js";
import {
  TerminalSessionStatus,
  TerminalThreadInput,
  TerminalOpenInput,
} from "./terminal.js";
import {
  FilesystemBrowseEntry,
  FilesystemBrowseResult,
} from "./filesystem.js";
import {
  ProjectEntry,
  ProjectSearchEntriesResult,
} from "./project.js";

// ---------------------------------------------------------------------------
// Helper: round-trip
// ---------------------------------------------------------------------------
const roundTrip = <S extends Schema.Schema<unknown, unknown>>(
  schema: S,
  value: Schema.Schema.Type<S>,
) => {
  const encoded = Schema.encodeSync(schema)(value);
  const decoded = Schema.decodeSync(schema)(encoded);
  expect(decoded).toEqual(value);
};

// ---------------------------------------------------------------------------
// baseSchemas
// ---------------------------------------------------------------------------
describe("baseSchemas", () => {
  describe("TrimmedString", () => {
    it("round-trips plain strings", () => {
      roundTrip(TrimmedString, "hello world");
      roundTrip(TrimmedString, "  spaced  ");
    });
  });

  describe("TrimmedNonEmptyString", () => {
    it("round-trips non-empty trimmed strings", () => {
      roundTrip(TrimmedNonEmptyString, "non-empty");
    });
    it("rejects empty strings", () => {
      expect(() => Schema.decodeSync(TrimmedNonEmptyString)("")).toThrow();
      expect(() => Schema.decodeSync(TrimmedNonEmptyString)("   ")).toThrow();
    });
    it("rejects max-length boundary", () => {
      const max = "a".repeat(1000);
      roundTrip(TrimmedNonEmptyString, max);
    });
    it("handles special unicode characters in names", () => {
      roundTrip(TrimmedNonEmptyString, "日本語一郎");
      roundTrip(TrimmedNonEmptyString, "José García");
      roundTrip(TrimmedNonEmptyString, "张三李四王五");
      roundTrip(TrimmedNonEmptyString, "🎉 celebration");
      roundTrip(TrimmedNonEmptyString, "emoji 👨‍👩‍👧‍👦 family");
    });
  });

  describe("NonNegativeInt", () => {
    it("round-trips zero and positive integers", () => {
      roundTrip(NonNegativeInt, 0);
      roundTrip(NonNegativeInt, 1);
      roundTrip(NonNegativeInt, 999999);
    });
    it("rejects negative integers", () => {
      expect(() => Schema.decodeSync(NonNegativeInt)(-1)).toThrow();
    });
  });

  describe("PositiveInt", () => {
    it("round-trips positive integers", () => {
      roundTrip(PositiveInt, 1);
      roundTrip(PositiveInt, 100);
    });
    it("rejects zero and negatives", () => {
      expect(() => Schema.decodeSync(PositiveInt)(0)).toThrow();
      expect(() => Schema.decodeSync(PositiveInt)(-5)).toThrow();
    });
  });

  describe("PortSchema", () => {
    it("round-trips valid ports", () => {
      roundTrip(PortSchema, 1);
      roundTrip(PortSchema, 80);
      roundTrip(PortSchema, 443);
      roundTrip(PortSchema, 8080);
      roundTrip(PortSchema, 65535);
    });
    it("rejects out-of-range ports", () => {
      expect(() => Schema.decodeSync(PortSchema)(0)).toThrow();
      expect(() => Schema.decodeSync(PortSchema)(65536)).toThrow();
    });
  });

  describe("branded IDs", () => {
    const testCases = [
      { Schema: ThreadId, value: ThreadId.make("thread-abc123") },
      { Schema: ProjectId, value: ProjectId.make("proj-def456") },
      { Schema: EnvironmentId, value: EnvironmentId.make("env-ghi789") },
      { Schema: CommandId, value: CommandId.make("cmd-jkl012") },
      { Schema: EventId, value: EventId.make("evt-mno345") },
      { Schema: MessageId, value: MessageId.make("msg-pqr678") },
      { Schema: TurnId, value: TurnId.make("turn-stu901") },
      { Schema: AuthSessionId, value: AuthSessionId.make("auth-vwx234") },
      { Schema: ProviderItemId, value: ProviderItemId.make("item-yzab567") },
      { Schema: RuntimeSessionId, value: RuntimeSessionId.make("rsess-cde890") },
      { Schema: RuntimeItemId, value: RuntimeItemId.make("ritem-fgh123") },
      { Schema: RuntimeRequestId, value: RuntimeRequestId.make("rreq-ijk456") },
      { Schema: RuntimeTaskId, value: RuntimeTaskId.make("rtask-lmn789") },
      { Schema: ApprovalRequestId, value: ApprovalRequestId.make("areq-opq012") },
      { Schema: CheckpointRef, value: CheckpointRef.make("cref-rst345") },
    ] as const;

    testCases.forEach(({ Schema: S, value }) => {
      it(`${S.name} round-trips valid ID`, () => {
        roundTrip(S, value);
      });
      it(`${S.name} rejects invalid slug`, () => {
        expect(() => Schema.decodeSync(S as any)("")).toThrow();
        expect(() => Schema.decodeSync(S as any)("x")).toThrow();
        expect(() => Schema.decodeSync(S as any)(" a b ")).toThrow();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
describe("auth", () => {
  const authEnums = [
    { Schema: ServerAuthPolicy, values: ["desktop-managed-local", "loopback-browser", "remote-reachable", "unsafe-no-auth"] },
    { Schema: ServerAuthBootstrapMethod, values: ["desktop-bootstrap", "one-time-token"] },
    { Schema: AuthSessionRole, values: ["owner", "client"] },
    { Schema: AuthClientMetadataDeviceType, values: ["desktop", "mobile"] },
  ] as const;

  authEnums.forEach(({ Schema: S, values }) => {
    describe(S.name, () => {
      values.forEach((value) => {
        it(`round-trips ${value}`, () => {
          roundTrip(S, value);
        });
      });
      it("rejects unknown values", () => {
        expect(() => Schema.decodeSync(S as any)("unknown-value")).toThrow();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// environment
// ---------------------------------------------------------------------------
describe("environment", () => {
  describe("ExecutionEnvironmentPlatformOs", () => {
    it("round-trips all OS values", () => {
      roundTrip(ExecutionEnvironmentPlatformOs, "darwin");
      roundTrip(ExecutionEnvironmentPlatformOs, "linux");
      roundTrip(ExecutionEnvironmentPlatformOs, "windows");
      roundTrip(ExecutionEnvironmentPlatformOs, "unknown");
    });
    it("rejects invalid OS", () => {
      expect(() => Schema.decodeSync(ExecutionEnvironmentPlatformOs)("freebsd")).toThrow();
    });
  });

  describe("ExecutionEnvironmentPlatformArch", () => {
    it("round-trips all arch values", () => {
      roundTrip(ExecutionEnvironmentPlatformArch, "arm64");
      roundTrip(ExecutionEnvironmentPlatformArch, "x64");
      roundTrip(ExecutionEnvironmentPlatformArch, "other");
    });
    it("rejects invalid arch", () => {
      expect(() => Schema.decodeSync(ExecutionEnvironmentPlatformArch)("riscv64")).toThrow();
    });
  });

  describe("ExecutionEnvironmentPlatform", () => {
    it("round-trips platform struct", () => {
      roundTrip(ExecutionEnvironmentPlatform, { os: "darwin", arch: "arm64" });
      roundTrip(ExecutionEnvironmentPlatform, { os: "linux", arch: "x64" });
      roundTrip(ExecutionEnvironmentPlatform, { os: "windows", arch: "x64" });
      roundTrip(ExecutionEnvironmentPlatform, { os: "unknown", arch: "other" });
    });
    it("produces parse error with meaningful path for invalid struct", () => {
      const result = Schema.decodeUnknown(ExecutionEnvironmentPlatform)({ os: 123 });
      expect(result._tag).toBe("Left");
    });
  });

  describe("EnvironmentConnectionState", () => {
    it("round-trips all connection states", () => {
      roundTrip(EnvironmentConnectionState, "connecting");
      roundTrip(EnvironmentConnectionState, "connected");
      roundTrip(EnvironmentConnectionState, "disconnected");
      roundTrip(EnvironmentConnectionState, "error");
    });
    it("rejects unknown state", () => {
      expect(() => Schema.decodeSync(EnvironmentConnectionState)("offline")).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// editor
// ---------------------------------------------------------------------------
describe("editor", () => {
  describe("EditorLaunchStyle", () => {
    it("round-trips all styles", () => {
      roundTrip(EditorLaunchStyle, "direct-path");
      roundTrip(EditorLaunchStyle, "goto");
      roundTrip(EditorLaunchStyle, "line-column");
    });
    it("rejects unknown style", () => {
      expect(() => Schema.decodeSync(EditorLaunchStyle)("default")).toThrow();
    });
  });

  describe("EditorId", () => {
    it("round-trips known editor IDs", () => {
      roundTrip(EditorId, "vscode");
      roundTrip(EditorId, "cursor");
      roundTrip(EditorId, "zed");
      roundTrip(EditorId, "idea");
    });
    it("rejects unknown editor ID", () => {
      expect(() => Schema.decodeSync(EditorId)("emacs")).toThrow();
    });
  });

  describe("LaunchEditorInput", () => {
    it("round-trips valid input", () => {
      roundTrip(LaunchEditorInput, { cwd: "/project", editor: "vscode" });
    });
    it("rejects empty cwd", () => {
      expect(() => Schema.decodeSync(LaunchEditorInput)({ cwd: "", editor: "vscode" })).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// sourceControl
// ---------------------------------------------------------------------------
describe("sourceControl", () => {
  const litCases = [
    { Schema: SourceControlProviderKind, values: ["github", "gitlab", "azure-devops", "bitbucket", "unknown"] },
    { Schema: ChangeRequestState, values: ["open", "closed", "merged"] },
    { Schema: SourceControlRepositoryVisibility, values: ["private", "public"] },
    { Schema: SourceControlCloneProtocol, values: ["auto", "ssh", "https"] },
  ] as const;

  litCases.forEach(({ Schema: S, values }) => {
    describe(S.name, () => {
      values.forEach((value) => {
        it(`round-trips ${value}`, () => {
          roundTrip(S, value);
        });
      });
      it("rejects unknown value", () => {
        expect(() => Schema.decodeSync(S as any)("unknown")).toThrow();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// vcs
// ---------------------------------------------------------------------------
describe("vcs", () => {
  describe("VcsDriverKind", () => {
    it("round-trips all driver kinds", () => {
      roundTrip(VcsDriverKind, "git");
      roundTrip(VcsDriverKind, "jj");
      roundTrip(VcsDriverKind, "unknown");
    });
    it("rejects unknown driver", () => {
      expect(() => Schema.decodeSync(VcsDriverKind)("fossil")).toThrow();
    });
  });

  describe("VcsFreshnessSource", () => {
    it("round-trips all freshness sources", () => {
      roundTrip(VcsFreshnessSource, "git-fetch");
      roundTrip(VcsFreshnessSource, "git-status");
      roundTrip(VcsFreshnessSource, "jj-obsync");
      roundTrip(VcsFreshnessSource, "jj-oplog");
    });
    it("rejects unknown source", () => {
      expect(() => Schema.decodeSync(VcsFreshnessSource)("unknown")).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// keybindings
// ---------------------------------------------------------------------------
describe("keybindings", () => {
  describe("KeybindingValue", () => {
    it("round-trips valid keybinding values", () => {
      roundTrip(KeybindingValue, "mod+j");
      roundTrip(KeybindingValue, "ctrl+shift+a");
      roundTrip(KeybindingValue, "f12");
    });
    it("rejects too-long keybinding values", () => {
      const long = "a".repeat(MAX_KEYBINDING_VALUE_LENGTH + 1);
      expect(() => Schema.decodeSync(KeybindingValue)(long)).toThrow();
    });
  });

  describe("KeybindingWhen", () => {
    it("round-trips valid when expressions", () => {
      roundTrip(KeybindingWhen, "editorTextFocus");
      roundTrip(KeybindingWhen, "editorTextFocus && editorHasSelection");
    });
    it("rejects too-long when expressions", () => {
      const long = "x".repeat(MAX_KEYBINDING_WHEN_LENGTH + 1);
      expect(() => Schema.decodeSync(KeybindingWhen)(long)).toThrow();
    });
  });

  describe("KeybindingRule", () => {
    it("round-trips a basic keybinding rule", () => {
      roundTrip(KeybindingRule, {
        key: "mod+j",
        command: "terminal.toggle",
      });
    });
    it("round-trips a rule with when expression", () => {
      roundTrip(KeybindingRule, {
        key: "mod+d",
        command: "diff.toggle",
        when: "editorTextFocus",
      });
    });
    it("rejects a rule with empty command", () => {
      expect(() => Schema.decodeSync(KeybindingRule)({ key: "mod+k", command: "" })).toThrow();
    });
  });

  describe("KeybindingsConfig", () => {
    it("round-trips a list of rules", () => {
      roundTrip(KeybindingsConfig, [
        { key: "mod+j", command: "terminal.toggle" },
        { key: "mod+k", command: "commandPalette.toggle" },
        { key: "mod+d", command: "diff.toggle", when: "editorTextFocus" },
      ]);
    });
    it("rejects too many bindings", () => {
      const many = Array.from({ length: 257 }, (_, i) => ({
        key: "f1",
        command: `cmd-${i}`,
      }));
      expect(() => Schema.decodeSync(KeybindingsConfig)(many)).toThrow();
    });
  });

  describe("ResolvedKeybindingRule", () => {
    it("round-trips a resolved keybinding rule", () => {
      roundTrip(ResolvedKeybindingRule, {
        key: "mod+j",
        command: "terminal.toggle",
        when: "editorTextFocus",
        source: "user",
      });
    });
    it("rejects invalid source", () => {
      expect(() => Schema.decodeSync(ResolvedKeybindingsConfig as any)([
        { key: "mod+j", command: "terminal.toggle", source: "invalid" },
      ])).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------
describe("model", () => {
  describe("ProviderOptionDescriptorType", () => {
    it("round-trips all descriptor types", () => {
      roundTrip(ProviderOptionDescriptorType, "select");
      roundTrip(ProviderOptionDescriptorType, "boolean");
    });
    it("rejects unknown type", () => {
      expect(() => Schema.decodeSync(ProviderOptionDescriptorType)("text")).toThrow();
    });
  });

  describe("BooleanProviderOptionDescriptor", () => {
    it("round-trips boolean option descriptor", () => {
      roundTrip(BooleanProviderOptionDescriptor, {
        id: "enabled",
        label: "Enabled",
        type: "boolean",
        description: "Enable feature",
      });
    });
    it("rejects non-boolean type in boolean descriptor", () => {
      const result = Schema.decodeUnknown(BooleanProviderOptionDescriptor)({
        id: "x",
        label: "X",
        type: "select",
        options: [],
      });
      expect(result._tag).toBe("Left");
    });
  });

  describe("SelectProviderOptionDescriptor", () => {
    it("round-trips select option descriptor", () => {
      roundTrip(SelectProviderOptionDescriptor, {
        id: "model",
        label: "Model",
        type: "select",
        options: [
          { id: "gpt-5", label: "GPT 5" },
          { id: "gpt-4", label: "GPT 4", isDefault: true },
        ],
      });
    });
    it("rejects non-select type in select descriptor", () => {
      const result = Schema.decodeUnknown(SelectProviderOptionDescriptor)({
        id: "x",
        label: "X",
        type: "boolean",
        currentValue: true,
      });
      expect(result._tag).toBe("Left");
    });
  });

  describe("ModelCapabilities", () => {
    it("round-trips minimal capabilities", () => {
      roundTrip(ModelCapabilities, {});
    });
    it("round-trips full capabilities", () => {
      roundTrip(ModelCapabilities, {
        supportsImages: true,
        supportsTools: false,
        supportsSystemPrompt: true,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// providerInstance
// ---------------------------------------------------------------------------
describe("providerInstance", () => {
  describe("ProviderDriverKind", () => {
    it("round-trips valid driver kinds", () => {
      roundTrip(ProviderDriverKind, "codex");
      roundTrip(ProviderDriverKind, "ollama");
    });
    it("rejects invalid slug", () => {
      expect(() => Schema.decodeSync(ProviderDriverKind)("")).toThrow();
      expect(() => Schema.decodeSync(ProviderDriverKind)("x y")).toThrow();
    });
  });

  describe("ProviderInstanceId", () => {
    it("round-trips valid instance ID", () => {
      roundTrip(ProviderInstanceId, ProviderInstanceId.make("my-custom-instance"));
    });
    it("rejects invalid slug", () => {
      expect(() => Schema.decodeSync(ProviderInstanceId)("")).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
describe("server", () => {
  describe("ServerProviderState", () => {
    it("round-trips all provider states", () => {
      roundTrip(ServerProviderState, "ready");
      roundTrip(ServerProviderState, "warning");
      roundTrip(ServerProviderState, "error");
      roundTrip(ServerProviderState, "disabled");
    });
    it("rejects unknown state", () => {
      expect(() => Schema.decodeSync(ServerProviderState)("unknown")).toThrow();
    });
  });

  describe("ServerProviderAuthStatus", () => {
    it("round-trips all auth statuses", () => {
      roundTrip(ServerProviderAuthStatus, "authenticated");
      roundTrip(ServerProviderAuthStatus, "unauthenticated");
      roundTrip(ServerProviderAuthStatus, "unknown");
    });
    it("rejects unknown status", () => {
      expect(() => Schema.decodeSync(ServerProviderAuthStatus)("pending")).toThrow();
    });
  });

  describe("ServerProviderAvailability", () => {
    it("round-trips all availability values", () => {
      roundTrip(ServerProviderAvailability, "available");
      roundTrip(ServerProviderAvailability, "unavailable");
    });
    it("rejects unknown availability", () => {
      expect(() => Schema.decodeSync(ServerProviderAvailability)("unknown")).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------
describe("settings", () => {
  describe("TimestampFormat", () => {
    it("round-trips all timestamp formats", () => {
      roundTrip(TimestampFormat, "locale");
      roundTrip(TimestampFormat, "12-hour");
      roundTrip(TimestampFormat, "24-hour");
    });
  });

  describe("SidebarProjectSortOrder", () => {
    it("round-trips all sort orders", () => {
      roundTrip(SidebarProjectSortOrder, "updated_at");
      roundTrip(SidebarProjectSortOrder, "created_at");
      roundTrip(SidebarProjectSortOrder, "manual");
    });
  });

  describe("SidebarThreadSortOrder", () => {
    it("round-trips all thread sort orders", () => {
      roundTrip(SidebarThreadSortOrder, "updated_at");
      roundTrip(SidebarThreadSortOrder, "created_at");
    });
  });

  describe("SidebarProjectGroupingMode", () => {
    it("round-trips all grouping modes", () => {
      roundTrip(SidebarProjectGroupingMode, "repository");
      roundTrip(SidebarProjectGroupingMode, "repository_path");
      roundTrip(SidebarProjectGroupingMode, "separate");
    });
  });

  describe("SidebarThreadPreviewCount", () => {
    it("round-trips boundary values", () => {
      roundTrip(SidebarThreadPreviewCount, 1);
      roundTrip(SidebarThreadPreviewCount, 6);
      roundTrip(SidebarThreadPreviewCount, 15);
    });
    it("rejects out-of-range values", () => {
      expect(() => Schema.decodeSync(SidebarThreadPreviewCount)(0)).toThrow();
      expect(() => Schema.decodeSync(SidebarThreadPreviewCount)(16)).toThrow();
    });
  });

  describe("ClientSettingsSchema", () => {
    it("round-trips minimal client settings", () => {
      roundTrip(ClientSettingsSchema, {});
    });
    it("round-trips full client settings", () => {
      roundTrip(ClientSettingsSchema, {
        autoOpenPlanSidebar: true,
        confirmThreadArchive: false,
        confirmThreadDelete: true,
        diffIgnoreWhitespace: false,
        diffWordWrap: true,
        timestampFormat: "12-hour",
        sidebarThreadSortOrder: "created_at",
        sidebarThreadPreviewCount: 10,
      });
    });
  });

  describe("ServerSettings", () => {
    it("round-trips default server settings", () => {
      const defaults = Schema.decodeSync(ServerSettings)({});
      roundTrip(ServerSettings, defaults);
    });
  });

  describe("ServerSettingsPatch", () => {
    it("round-trips a partial patch", () => {
      roundTrip(ServerSettingsPatch, {
        textGenerationModelSelection: { model: "gpt-5.4-mini" },
      });
    });
    it("round-trips an empty patch", () => {
      roundTrip(ServerSettingsPatch, {});
    });
  });
});

// ---------------------------------------------------------------------------
// terminal
// ---------------------------------------------------------------------------
describe("terminal", () => {
  describe("TerminalSessionStatus", () => {
    it("round-trips all session statuses", () => {
      roundTrip(TerminalSessionStatus, "starting");
      roundTrip(TerminalSessionStatus, "running");
      roundTrip(TerminalSessionStatus, "exited");
      roundTrip(TerminalSessionStatus, "error");
    });
    it("rejects unknown status", () => {
      expect(() => Schema.decodeSync(TerminalSessionStatus)("stopped")).toThrow();
    });
  });

  describe("TerminalThreadInput", () => {
    it("round-trips minimal terminal thread input", () => {
      roundTrip(TerminalThreadInput, {
        threadId: ThreadId.make("thread-terminal"),
      });
    });
    it("round-trips with optional fields", () => {
      roundTrip(TerminalThreadInput, {
        threadId: ThreadId.make("thread-terminal"),
        cwd: "/project",
      });
    });
  });

  describe("TerminalOpenInput", () => {
    it("round-trips terminal open input", () => {
      roundTrip(TerminalOpenInput, {
        threadId: ThreadId.make("thread-open"),
        cwd: "/project",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// filesystem
// ---------------------------------------------------------------------------
describe("filesystem", () => {
  describe("FilesystemBrowseEntry", () => {
    it("round-trips a file entry", () => {
      roundTrip(FilesystemBrowseEntry, {
        path: "/project/file.txt",
        isDirectory: false,
        size: 1024,
        mtimeMs: 1710000000000,
      });
    });
    it("round-trips a directory entry", () => {
      roundTrip(FilesystemBrowseEntry, {
        path: "/project/src",
        isDirectory: true,
        mtimeMs: 1710000000000,
      });
    });
    it("rejects negative size", () => {
      const result = Schema.decodeUnknown(FilesystemBrowseEntry)({
        path: "/f",
        isDirectory: false,
        size: -1,
        mtimeMs: 0,
      });
      expect(result._tag).toBe("Left");
    });
  });

  describe("FilesystemBrowseResult", () => {
    it("round-trips browse result with entries", () => {
      roundTrip(FilesystemBrowseResult, {
        entries: [
          { path: "/project/a.txt", isDirectory: false, mtimeMs: 0 },
          { path: "/project/b", isDirectory: true, mtimeMs: 0 },
        ],
      });
    });
    it("round-trips empty result", () => {
      roundTrip(FilesystemBrowseResult, { entries: [] });
    });
  });
});

// ---------------------------------------------------------------------------
// project
// ---------------------------------------------------------------------------
describe("project", () => {
  describe("ProjectEntry", () => {
    it("round-trips a minimal project entry", () => {
      roundTrip(ProjectEntry, {
        projectId: ProjectId.make("proj-minimal"),
        path: "/workspace/minimal",
        name: "minimal",
      });
    });
    it("round-trips a full project entry", () => {
      roundTrip(ProjectEntry, {
        projectId: ProjectId.make("proj-full"),
        path: "/workspace/my-project",
        name: "My Project",
        description: "A great project",
        repositoryUrl: "https://github.com/user/repo",
      });
    });
  });

  describe("ProjectSearchEntriesResult", () => {
    it("round-trips search result with entries", () => {
      roundTrip(ProjectSearchEntriesResult, {
        entries: [
          {
            projectId: ProjectId.make("proj-srch-1"),
            path: "/workspace/search-1",
            name: "Search 1",
          },
          {
            projectId: ProjectId.make("proj-srch-2"),
            path: "/workspace/search-2",
            name: "Search 2",
          },
        ],
      });
    });
    it("round-trips empty search result", () => {
      roundTrip(ProjectSearchEntriesResult, { entries: [] });
    });
  });
});