import { describe, expect, test } from "bun:test";
import { bool, parseArgs, str } from "../src/args";

describe("parseArgs", () => {
  test("no arguments", () => {
    expect(parseArgs([])).toEqual({ positional: [], flags: {} });
  });

  test("positionals keep their order", () => {
    expect(parseArgs(["routes", "add", "todo", "/todos/*"]).positional).toEqual(
      ["routes", "add", "todo", "/todos/*"]
    );
  });

  test("--key value and --key=value are the same", () => {
    expect(parseArgs(["--name", "Todo"]).flags).toEqual({ name: "Todo" });
    expect(parseArgs(["--name=Todo"]).flags).toEqual({ name: "Todo" });
  });

  test("a value may itself contain '='", () => {
    expect(parseArgs(["--redirects=https://a.test/cb?x=1"]).flags).toEqual({
      redirects: "https://a.test/cb?x=1",
    });
  });

  test("--key= is an empty string, not a boolean", () => {
    expect(parseArgs(["--origins="]).flags).toEqual({ origins: "" });
  });

  test("a flag with nothing after it, or followed by another flag, is boolean", () => {
    expect(parseArgs(["--init"]).flags).toEqual({ init: true });
    expect(parseArgs(["--init", "--name", "x"]).flags).toEqual({
      init: true,
      name: "x",
    });
    expect(parseArgs(["--force", "-y"]).flags).toEqual({
      force: true,
      yes: true,
    });
  });

  test("-h and -y are short for --help and --yes", () => {
    expect(parseArgs(["-h"]).flags).toEqual({ help: true });
    expect(parseArgs(["apps", "delete", "todo", "-y"])).toEqual({
      positional: ["apps", "delete", "todo"],
      flags: { yes: true },
    });
  });

  test("flags and positionals can be interleaved", () => {
    expect(
      parseArgs(["apps", "create", "todo", "--name", "Todo App", "--init"])
    ).toEqual({
      positional: ["apps", "create", "todo"],
      flags: { name: "Todo App", init: true },
    });
  });

  test("everything after -- is positional", () => {
    expect(parseArgs(["a", "--", "--not-a-flag", "-y"])).toEqual({
      positional: ["a", "--not-a-flag", "-y"],
      flags: {},
    });
  });

  test("the last occurrence of a flag wins", () => {
    expect(parseArgs(["--name", "a", "--name", "b"]).flags).toEqual({
      name: "b",
    });
  });
});

describe("str and bool", () => {
  const { flags } = parseArgs([
    "--name",
    "Todo",
    "--init",
    "--active",
    "false",
    "--organizations",
    "true",
  ]);

  test("str returns only string values", () => {
    expect(str(flags, "name")).toBe("Todo");
    expect(str(flags, "init")).toBeUndefined();
    expect(str(flags, "missing")).toBeUndefined();
  });

  test("bool is true for a bare flag and for the word 'true' only", () => {
    expect(bool(flags, "init")).toBe(true);
    expect(bool(flags, "organizations")).toBe(true);
    expect(bool(flags, "active")).toBe(false);
    expect(bool(flags, "name")).toBe(false);
    expect(bool(flags, "missing")).toBe(false);
  });
});
