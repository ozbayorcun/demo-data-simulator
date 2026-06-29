import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("keeps subcommands as positionals while parsing flags", () => {
    expect(parseArgs(["pack", "export", "--pack", "field-service", "--out", "spec.json"])).toEqual({
      command: "pack",
      positionals: ["export"],
      flags: { pack: "field-service", out: "spec.json" },
    });
  });
});
