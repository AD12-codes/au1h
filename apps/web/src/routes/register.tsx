import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/register")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsLoading(true);
        setError(null);

        await authClient.signUp.email({
          name: value.name,
          email: value.email,
          password: value.password,
          callbackURL: "/dashboard",
          fetchOptions: {
            onSuccess: () => router.navigate({ to: "/dashboard" }),
            onError: (ctx) => {
              setError(ctx.error.message || "Registration failed");
            },
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setIsLoading(false);
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
              <CardTitle className="text-base">Create an account</CardTitle>
              <CardDescription className="text-muted-foreground">
                Admin accounts are by invitation or allowlist. If yours is
                rejected, ask an existing administrator.
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
                <form.Field
                  name="name"
                  validators={{
                    onChange: ({ value }) =>
                      value.length < 2
                        ? "Name must be at least 2 characters"
                        : undefined,
                  }}
                >
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        disabled={isLoading}
                        id="name"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="John Doe"
                        type="text"
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
                      <Label htmlFor="password">Password</Label>
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

                <Button
                  className="w-full"
                  disabled={isLoading}
                  size="lg"
                  type="submit"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Creating account...
                    </div>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>

              <div className="text-center text-[13px] text-muted-foreground">
                Already have an account?{" "}
                <Link
                  className="font-medium text-primary hover:underline"
                  to="/login"
                >
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StarsBackground>
  );
}
