import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
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

type ResetPasswordSearch = {
  token?: string;
  error?: string;
};

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: RouteComponent,
});

function getInitialTokenError(searchError?: string): string {
  if (searchError === "INVALID_TOKEN" || searchError === "token_expired") {
    return "This link has expired or was already used.";
  }
  return "Missing or invalid reset token.";
}

function parseResetError(err: unknown): { isToken: boolean; message: string } {
  if (!err) {
    return { isToken: false, message: "Failed to reset password" };
  }

  const code =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof err.code === "string"
      ? err.code
      : undefined;

  let message = "Failed to reset password";
  if (err instanceof Error) {
    message = err.message;
  } else if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    message = err.message;
  }

  const isToken = code === "INVALID_TOKEN";
  return { isToken, message };
}

function RouteComponent() {
  const { token, error: searchError } = Route.useSearch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const applyError = (parsed: { isToken: boolean; message: string }) => {
    if (parsed.isToken) {
      setTokenError("This link has expired or was already used.");
    } else {
      setError(parsed.message);
    }
  };

  const handleResetSubmit = async (password: string) => {
    if (!token) {
      setTokenError("Missing or invalid reset token.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setTokenError(null);

      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (res?.error) {
        applyError(parseResetError(res.error));
        return;
      }

      toast.success(
        "Password updated. You can now sign in with your new password."
      );
      router.navigate({ to: "/login" });
    } catch (err) {
      applyError(parseResetError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      await handleResetSubmit(value.password);
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
              <CardTitle className="text-base">Set a new password</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter and confirm your new password below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!token && (
                <div className="space-y-4">
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {getInitialTokenError(searchError)}{" "}
                    <Link
                      className="font-medium underline hover:text-destructive/80"
                      to="/forgot-password"
                    >
                      Request a new reset link
                    </Link>
                    .
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
              )}

              {token && (
                <>
                  {tokenError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                      {tokenError}{" "}
                      <Link
                        className="font-medium underline hover:text-destructive/80"
                        to="/forgot-password"
                      >
                        Request a new reset link
                      </Link>
                      .
                    </div>
                  )}

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
                    <form.Field
                      name="password"
                      validators={{
                        onChange: ({ value }) =>
                          value.length < 8
                            ? "Password must be at least 8 characters"
                            : undefined,
                      }}
                    >
                      {(field) => (
                        <div className="space-y-1.5">
                          <Label htmlFor="password">New password</Label>
                          <Input
                            disabled={isLoading}
                            id="password"
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="••••••••"
                            type="password"
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

                    <form.Field
                      name="confirmPassword"
                      validators={{
                        onChangeListenTo: ["password"],
                        onChange: ({ value, fieldApi }) => {
                          if (!value) {
                            return;
                          }
                          if (
                            value !== fieldApi.form.getFieldValue("password")
                          ) {
                            return "Passwords do not match";
                          }
                        },
                      }}
                    >
                      {(field) => (
                        <div className="space-y-1.5">
                          <Label htmlFor="confirmPassword">
                            Confirm new password
                          </Label>
                          <Input
                            disabled={isLoading}
                            id="confirmPassword"
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="••••••••"
                            type="password"
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
                          Updating password...
                        </div>
                      ) : (
                        "Update password"
                      )}
                    </Button>
                  </form>

                  <div className="text-center text-[13px] text-muted-foreground">
                    <Link
                      className="font-medium text-primary hover:underline"
                      to="/login"
                    >
                      Return to sign in
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
