import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  authPost,
  codeIn,
  cookiesOf,
  getSession,
  type Harness,
  INTEGRATION,
  lastEmailTo,
  linkIn,
  openLink,
  retarget,
  startHarness,
} from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;
const tokenOf = (link: string) => new URL(link).searchParams.get("token");

describeIntegration("email flows are tenant-scoped", () => {
  let h: Harness;
  const email = "person@example.com";

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);

  afterAll(async () => {
    await h?.cleanup();
  });

  beforeEach(() => h.clearOutbox());

  test("sign-up sends a branded verification email whose link carries the app", async () => {
    const res = await authPost(h.app, h.apps.a.slug, "/sign-up/email", {
      email,
      password: "password123",
      name: "Person A",
    });
    expect(res.status).toBe(200);

    const sent = lastEmailTo(h.outbox(), email);
    expect(sent.subject).toBe(`Verify your email for ${h.apps.a.name}`);
    const link = linkIn(sent);
    expect(new URL(link).searchParams.get("app")).toBe(h.apps.a.slug);

    expect((await h.findUser(h.apps.a.id, email))?.emailVerified).toBe(false);

    // The link is opened in a fresh browser: no x-app-id header, no cookie.
    const opened = await openLink(h.app, link);
    expect(opened.status).toBe(302);
    expect((await h.findUser(h.apps.a.id, email))?.emailVerified).toBe(true);
  });

  test("the same email in another app is a different, unverified user", async () => {
    const res = await authPost(h.app, h.apps.b.slug, "/sign-up/email", {
      email,
      password: "another-password",
      name: "Person B",
    });
    expect(res.status).toBe(200);

    const sent = lastEmailTo(h.outbox(), email);
    expect(sent.subject).toBe(`Verify your email for ${h.apps.b.name}`);
    expect(new URL(linkIn(sent)).searchParams.get("app")).toBe(h.apps.b.slug);

    const a = await h.findUser(h.apps.a.id, email);
    const b = await h.findUser(h.apps.b.id, email);
    expect(a?.id).not.toBe(b?.id);
    expect(a?.emailVerified).toBe(true);
    expect(b?.emailVerified).toBe(false);
  });

  test("a verification link cannot verify the same address in another app", async () => {
    const victim = "replay@example.com";
    for (const target of [h.apps.a, h.apps.b]) {
      const res = await authPost(h.app, target.slug, "/sign-up/email", {
        email: victim,
        password: "password123",
        name: "Replay",
      });
      expect(res.status).toBe(200);
    }
    // The outbox now holds A's link then B's link, both unverified users.
    const [first, second] = h
      .outbox()
      .filter((m) => m.to === victim)
      .map(linkIn);
    const linkA = first as string;
    let linkB = second as string;
    expect(new URL(linkA).searchParams.get("app")).toBe(h.apps.a.slug);
    expect(new URL(linkB).searchParams.get("app")).toBe(h.apps.b.slug);

    // Better Auth's verification JWT is deterministic to the second, so two
    // apps mailing the same address at once mint the same token (and the
    // same inbox got both links). Wait until B's token is its own.
    for (let i = 0; tokenOf(linkB) === tokenOf(linkA) && i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      h.clearOutbox();
      await authPost(h.app, h.apps.b.slug, "/send-verification-email", {
        email: victim,
        callbackURL: "/",
      });
      linkB = linkIn(lastEmailTo(h.outbox(), victim));
    }
    expect(tokenOf(linkB)).not.toBe(tokenOf(linkA));

    // B's token, pointed at A: rejected, A's user stays unverified.
    const replayed = await openLink(h.app, retarget(linkB, h.apps.a.slug));
    expect(replayed.status).toBe(400);
    expect((await h.findUser(h.apps.a.id, victim))?.emailVerified).toBe(false);

    // Each app's own link still works.
    expect((await openLink(h.app, linkA)).status).toBe(302);
    expect((await openLink(h.app, linkB)).status).toBe(302);
    expect((await h.findUser(h.apps.a.id, victim))?.emailVerified).toBe(true);
    expect((await h.findUser(h.apps.b.id, victim))?.emailVerified).toBe(true);
  });

  test("password reset works for the app that issued it only", async () => {
    const requested = await authPost(
      h.app,
      h.apps.a.slug,
      "/request-password-reset",
      {
        email,
        redirectTo: "/reset",
      }
    );
    expect(requested.status).toBe(200);

    const sent = lastEmailTo(h.outbox(), email);
    expect(sent.subject).toBe(`Reset your ${h.apps.a.name} password`);
    const link = linkIn(sent);
    expect(new URL(link).searchParams.get("app")).toBe(h.apps.a.slug);

    // Opening the link hands the token to the app's reset page.
    const opened = await openLink(h.app, link);
    expect(opened.status).toBe(302);
    const token = new URL(
      opened.headers.get("location") ?? "",
      "http://localhost"
    ).searchParams.get("token");
    expect(token).toBeTruthy();

    // App B cannot use app A's token.
    const crossTenant = await authPost(
      h.app,
      h.apps.b.slug,
      "/reset-password",
      {
        newPassword: "hijacked-password",
        token,
      }
    );
    expect(crossTenant.status).toBeGreaterThanOrEqual(400);

    const reset = await authPost(h.app, h.apps.a.slug, "/reset-password", {
      newPassword: "new-password-456",
      token,
    });
    expect(reset.status).toBe(200);

    const oldPassword = await authPost(h.app, h.apps.a.slug, "/sign-in/email", {
      email,
      password: "password123",
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await authPost(h.app, h.apps.a.slug, "/sign-in/email", {
      email,
      password: "new-password-456",
    });
    expect(newPassword.status).toBe(200);

    // App B's user still has its own password.
    const bSignIn = await authPost(h.app, h.apps.b.slug, "/sign-in/email", {
      email,
      password: "another-password",
    });
    expect(bSignIn.status).toBe(200);
  });

  test("a magic link signs in to the app that sent it and nowhere else", async () => {
    const requested = await authPost(
      h.app,
      h.apps.a.slug,
      "/sign-in/magic-link",
      {
        email,
        callbackURL: "/",
      }
    );
    expect(requested.status).toBe(200);

    const sent = lastEmailTo(h.outbox(), email);
    expect(sent.subject).toBe(`Sign in to ${h.apps.a.name}`);
    const link = linkIn(sent);

    // Presented to app B first: rejected, and the token is not consumed.
    const stolen = await openLink(h.app, retarget(link, h.apps.b.slug));
    expect(stolen.status).toBe(302);
    expect(stolen.headers.get("location")).toContain("error=");

    const opened = await openLink(h.app, link);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).not.toContain("error=");
    const cookie = cookiesOf(opened);
    expect(cookie).toContain("session_token");

    const session = await getSession(h.app, h.apps.a.slug, cookie);
    expect(session?.user.email).toBe(email);
    expect(session?.user.id).toBe((await h.findUser(h.apps.a.id, email))?.id);

    // The session cookie belongs to app A; app B does not recognise it.
    expect(await getSession(h.app, h.apps.b.slug, cookie)).toBeNull();
  });

  test("an email OTP is only valid for the app that requested it", async () => {
    const requested = await authPost(
      h.app,
      h.apps.a.slug,
      "/email-otp/send-verification-otp",
      {
        email,
        type: "sign-in",
      }
    );
    expect(requested.status).toBe(200);

    const sent = lastEmailTo(h.outbox(), email);
    const code = codeIn(sent);
    expect(sent.subject).toBe(`${code} is your ${h.apps.a.name} code`);
    expect(sent.text).toContain(code);

    const wrong = await authPost(h.app, h.apps.a.slug, "/sign-in/email-otp", {
      email,
      otp: "000000",
    });
    expect(wrong.status).toBe(400);

    const crossTenant = await authPost(
      h.app,
      h.apps.b.slug,
      "/sign-in/email-otp",
      {
        email,
        otp: code,
      }
    );
    expect(crossTenant.status).toBe(400);

    const signedIn = await authPost(
      h.app,
      h.apps.a.slug,
      "/sign-in/email-otp",
      {
        email,
        otp: code,
      }
    );
    expect(signedIn.status).toBe(200);
    const session = await getSession(h.app, h.apps.a.slug, cookiesOf(signedIn));
    expect(session?.user.email).toBe(email);
  });

  test("a link for an unknown app is rejected", async () => {
    await authPost(h.app, h.apps.a.slug, "/sign-in/magic-link", {
      email,
      callbackURL: "/",
    });
    const link = linkIn(lastEmailTo(h.outbox(), email));
    const opened = await openLink(h.app, retarget(link, "no-such-app"));
    expect(opened.status).toBeGreaterThanOrEqual(400);
  });
});
