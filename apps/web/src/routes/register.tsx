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
              <CardTitle className="text-2xl">Create an account</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your details to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
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
                    <div className="space-y-2">
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
                        <p className="text-destructive text-sm">
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
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                        ? undefined
                        : "Invalid email address",
                  }}
                >
                  {(field) => (
                    <div className="space-y-2">
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
                        <p className="text-destructive text-sm">
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
                    <div className="space-y-2">
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
                        <p className="text-destructive text-sm">
                          {field.state.meta.errors[0]}
                        </p>
                      )}
                    </div>
                  )}
                </form.Field>

                <Button
                  className="h-12 w-full font-medium text-base"
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

              <div className="text-center text-muted-foreground text-sm">
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
