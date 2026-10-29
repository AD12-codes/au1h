import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useState } from "react";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { Wordmark } from "@/components/shared/wordmark";
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/forgot-password")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { resolvedTheme } = useTheme();

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsLoading(true);
        await authClient.requestPasswordReset({
          email: value.email,
          redirectTo: "/reset-password",
        });
      } catch {
        // Neutral response: do not disclose if the email exists
      } finally {
        setIsLoading(false);
        setIsSubmitted(true);
      }
    },
  });

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
            <Wordmark size={30} />
            <p className="text-center text-[13px] text-muted-foreground">
              Auth for all of your apps, in one place.
            </p>
          </div>

          <Card className="border-border/80 bg-card/90 shadow-xl backdrop-blur">
            <CardHeader className="text-center">
              <CardTitle className="text-base">Reset your password</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your email address and we'll send you a link to reset your
                password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isSubmitted ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/40 p-4 text-center text-[13px] text-muted-foreground">
                    Check your email: if an account exists for that address, we
                    sent a password reset link.
                  </div>
                  <div className="text-center text-[13px] text-muted-foreground">
                    <Link
                      className="font-medium text-primary hover:underline"
                      to="/login"
                    >
                      Return to sign in
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      form.handleSubmit();
                    }}
                  >
                    <form.Field
                      name="email"
                      validators={{
                        onChange: ({ value }) =>
                          EMAIL_REGEX.test(value)
                            ? undefined
                            : "Invalid email address",
                      }}
                    >
                      {(field) => (
                        <div className="space-y-1.5">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            disabled={isLoading}
                            id="email"
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="you@example.com"
                            type="email"
                            value={field.state.value}
                          />
                          {field.state.meta.errors.length > 0 && (
                            <p className="text-destructive text-xs">
                              {field.state.meta.errors[0]}
                            </p>
                          )}
                        </div>
                      )}
                    </form.Field>

                    <Button
                      className="w-full"
                      disabled={isLoading}
                      size="lg"
                      type="submit"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Sending reset link...
                        </div>
                      ) : (
                        "Send reset link"
                      )}
                    </Button>
                  </form>

                  <div className="text-center text-[13px] text-muted-foreground">
                    Remember your password?{" "}
                    <Link
                      className="font-medium text-primary hover:underline"
                      to="/login"
                    >
                      Sign in
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StarsBackground>
  );
}
