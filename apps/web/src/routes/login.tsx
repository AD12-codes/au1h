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
