import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearConfig,
  configPath,
  readConfig,
  writeConfig,
} from "../src/config";
import { fileMode, removeTempDirs, tempDir } from "./run";

const KEYS = ["AU1H_CONFIG_DIR", "XDG_CONFIG_HOME", "AU1H_URL", "AU1H_TOKEN"];

describe("config file", () => {
  const saved: Record<string, string | undefined> = {};
  let dir: string;

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      process.env[key] = "";
    }
    dir = tempDir("config");
    process.env.AU1H_CONFIG_DIR = dir;
  });
  afterEach(() => {
    for (const key of KEYS) {
      process.env[key] = saved[key] ?? "";
    }
  });
  afterAll(removeTempDirs);

  test("AU1H_CONFIG_DIR is used as given", () => {
    expect(configPath()).toBe(join(dir, "config.json"));
  });

  test("otherwise the file lives in an au1h folder under XDG_CONFIG_HOME", () => {
    process.env.AU1H_CONFIG_DIR = "";
    process.env.XDG_CONFIG_HOME = dir;
    expect(configPath()).toBe(join(dir, "au1h", "config.json"));
  });

  test("nothing stored means not logged in", () => {
    expect(readConfig()).toBeNull();
    expect(clearConfig()).toBe(false);
  });

  test("a login round-trips", () => {
    const config = { url: "https://auth.example.com", token: "au1h_pat_abc" };
    expect(writeConfig(config)).toBe(configPath());
    expect(readConfig()).toEqual(config);
  });

  test("the token file is readable by its owner only", () => {
    writeConfig({ url: "https://auth.example.com", token: "au1h_pat_abc" });
    expect(fileMode(configPath())).toBe(0o600);
  });

  test("an existing world-readable file is tightened on the next login", () => {
    writeFileSync(configPath(), "{}", { mode: 0o644 });
    writeConfig({ url: "https://auth.example.com", token: "au1h_pat_abc" });
    expect(fileMode(configPath())).toBe(0o600);
  });

  test("the directory is created when missing", () => {
    process.env.AU1H_CONFIG_DIR = join(dir, "nested", "deeper");
    writeConfig({ url: "https://auth.example.com", token: "au1h_pat_abc" });
    expect(existsSync(configPath())).toBe(true);
  });

  test("logout removes the file", () => {
    writeConfig({ url: "https://auth.example.com", token: "au1h_pat_abc" });
    expect(clearConfig()).toBe(true);
    expect(existsSync(configPath())).toBe(false);
    expect(readConfig()).toBeNull();
  });

  test("a corrupt or incomplete file is treated as not logged in", () => {
    for (const content of ["not json", "{}", '{"url":"https://x"}', "null"]) {
      writeFileSync(configPath(), content);
      expect(readConfig()).toBeNull();
    }
  });

  test("AU1H_URL and AU1H_TOKEN together win over the file", () => {
    writeConfig({ url: "https://file.example.com", token: "au1h_pat_file" });
    process.env.AU1H_URL = "https://env.example.com";
    process.env.AU1H_TOKEN = "au1h_pat_env";
    expect(readConfig()).toEqual({
      url: "https://env.example.com",
      token: "au1h_pat_env",
    });
  });

  test("only one of the two does not override the file", () => {
    writeConfig({ url: "https://file.example.com", token: "au1h_pat_file" });
    process.env.AU1H_URL = "https://env.example.com";
    expect(readConfig()?.url).toBe("https://file.example.com");
  });

  test("a trailing slash on AU1H_URL is dropped", () => {
    process.env.AU1H_URL = "https://env.example.com//";
    process.env.AU1H_TOKEN = "au1h_pat_env";
    expect(readConfig()?.url).toBe("https://env.example.com");
  });

  test("the stored file contains the token and nothing unexpected", () => {
    writeConfig({ url: "https://auth.example.com", token: "au1h_pat_abc" });
    expect(JSON.parse(readFileSync(configPath(), "utf8"))).toEqual({
      url: "https://auth.example.com",
      token: "au1h_pat_abc",
    });
  });
});
