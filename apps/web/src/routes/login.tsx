import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isLoading, setIsLoading] = useState<"google" | "github" | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const handleSocialSignIn = async (provider: "google" | "github") => {
    try {
      setIsLoading(provider);
      await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/dashboard`,
        newUserCallbackURL: `${window.location.origin}/dashboard`,
        fetchOptions: {
          onSuccess: () => router.navigate({ to: "/dashboard" }),
        },
      });
    } catch (error) {
      console.error(`${provider} sign-in failed:`, error);
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
          <div className="mb-8 flex flex-col items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 ring-1 ring-primary/20">
                <ShieldCheck
                  className="size-8 text-primary"
                  strokeWidth={2.5}
                />
              </div>
            </div>
            <div className="space-y-2 text-center">
              <h1 className="font-bold text-4xl text-foreground tracking-tight">
                au1h
              </h1>
              <p className="text-muted-foreground text-sm">
                Centralized Authentication Platform
              </p>
            </div>
          </div>

          <Card className="border-border shadow-lg">
            <CardHeader className="space-y-2 pb-4 text-center">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription className="text-muted-foreground">
                Sign in to access the admin portal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <Button
                className="h-12 w-full font-medium text-base"
                disabled={isLoading !== null}
                onClick={() => handleSocialSignIn("google")}
                size="lg"
              >
                {isLoading === "google" ? (
                  <div className="flex items-center gap-2">
                    <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Connecting...
                  </div>
                ) : (
                  <>
                    <svg
                      aria-label="Google logo"
                      className="size-5"
                      viewBox="0 0 24 24"
                    >
                      <title>Google logo</title>
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
                    Continue with Google
                  </>
                )}
              </Button>

              <Button
                className="h-12 w-full font-medium text-base"
                disabled={isLoading !== null}
                onClick={() => handleSocialSignIn("github")}
                size="lg"
              >
                {isLoading === "github" ? (
                  <div className="flex items-center gap-2">
                    <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Connecting...
                  </div>
                ) : (
                  <>
                    <Github className="size-5" />
                    Continue with GitHub
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </StarsBackground>
  );
}
