import { describe, expect, test } from "bun:test";
import { stripAu1hCookies } from "./cookies";

describe("stripAu1hCookies", () => {
  test("no header, or an empty one, yields no header", () => {
    expect(stripAu1hCookies(null)).toBeNull();
    expect(stripAu1hCookies("")).toBeNull();
    expect(stripAu1hCookies(" ; ;")).toBeNull();
  });

  test("the session cookie is removed and nothing is left", () => {
    expect(stripAu1hCookies("better-auth.session_token=abc.def")).toBeNull();
  });

  test("every Better Auth cookie goes, with or without the secure prefix", () => {
    expect(
      stripAu1hCookies(
        [
          "better-auth.session_token=a",
          "better-auth.session_data=b",
          "better-auth.dont_remember=true",
          "__Secure-better-auth.session_token=c",
          "__Host-better-auth.state=d",
          "__secure-Better-Auth.session_token=e",
        ].join("; ")
      )
    ).toBeNull();
  });

  test("the OAuth tenant cookie is removed", () => {
    expect(stripAu1hCookies("au1h-app-id=my-app")).toBeNull();
  });

  test("a backend's own cookies survive, in order", () => {
    expect(
      stripAu1hCookies(
        "theme=dark; better-auth.session_token=abc; backend_session=xyz;au1h-app-id=my-app; lang=en"
      )
    ).toBe("theme=dark; backend_session=xyz; lang=en");
  });

  test("values containing '=' are kept whole", () => {
    expect(stripAu1hCookies("prefs=a=1&b=2; better-auth.session_token=x")).toBe(
      "prefs=a=1&b=2"
    );
  });

  test("names that merely resemble au1h's are not touched", () => {
    const header =
      "better-auth=1; my-better-auth.session_token=2; au1h-app-id-x=3";
    expect(stripAu1hCookies(header)).toBe(header);
  });
});
