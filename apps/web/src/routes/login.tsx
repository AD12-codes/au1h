import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Github, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isLoading, setIsLoading] = useState<
    "google" | "github" | "email" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsLoading("email");
        setError(null);

        await authClient.signIn.email({
          email: value.email,
          password: value.password,
          callbackURL: "/dashboard",
          fetchOptions: {
            onSuccess: () => router.navigate({ to: "/dashboard" }),
            onError: (ctx) => {
              setError(ctx.error.message || "Invalid email or password");
            },
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      } finally {
        setIsLoading(null);
      }
    },
  });

  const handleSocialSignIn = async (provider: "google" | "github") => {
    try {
      setIsLoading(provider);
      setError(null);
      await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/dashboard`,
        newUserCallbackURL: `${window.location.origin}/dashboard`,
        fetchOptions: {
          onSuccess: () => router.navigate({ to: "/dashboard" }),
        },
      });
    } catch (err) {
      console.error(`${provider} sign-in failed:`, err);
      setError(`${provider} sign-in failed`);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <StarsBackground
      className="min-h-screen"
      factor={0.02}
      pointerEvents={false}
      speed={60}
      starColor={resolvedTheme === "dark" ? "#fff" : "#000"}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground shadow-md">
              <ShieldCheck className="size-5" strokeWidth={2.5} />
            </div>
            <div className="space-y-1 text-center">
              <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                au1h
              </h1>
              <p className="text-[13px] text-muted-foreground">
                Auth for all of your apps, in one place.
              </p>
            </div>
          </div>

          <Card className="border-border/80 bg-card/90 shadow-xl backdrop-blur">
            <CardHeader className="text-center">
              <CardTitle className="text-base">Welcome back</CardTitle>
              <CardDescription className="text-muted-foreground">
                Sign in to access the admin portal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </div>
              )}

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
              >
                <form.Field name="email">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        disabled={isLoading !== null}
                        id="email"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="you@example.com"
                        type="email"
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        disabled={isLoading !== null}
                        id="password"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="••••••••"
                        type="password"
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>

                <Button
                  className="w-full"
                  disabled={isLoading !== null}
                  size="lg"
                  type="submit"
                >
                  {isLoading === "email" ? (
                    <div className="flex items-center gap-2">
                      <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Signing in...
                    </div>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-card px-2 text-muted-foreground">
                    or continue with
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="bg-card"
                  disabled={isLoading !== null}
                  onClick={() => handleSocialSignIn("github")}
                  variant="outline"
                >
                  {isLoading === "github" ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <>
                      <Github className="size-4" />
                      GitHub
                    </>
                  )}
                </Button>
                <Button
                  className="bg-card"
                  disabled={isLoading !== null}
                  onClick={() => handleSocialSignIn("google")}
                  variant="outline"
                >
                  {isLoading === "google" ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <>
                      <svg className="size-4" viewBox="0 0 24 24">
                        <title>Google</title>
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="currentColor"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="currentColor"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="currentColor"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="currentColor"
                        />
                      </svg>
                      Google
                    </>
                  )}
                </Button>
              </div>

              <div className="text-center text-[13px] text-muted-foreground">
                Don't have an account?{" "}
                <Link
                  className="font-medium text-primary hover:underline"
                  to="/register"
                >
                  Sign up
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StarsBackground>
  );
}
