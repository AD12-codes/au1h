import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Home, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getFirstName(name: string): string {
  return name.split(" ")[0];
}

export function Header() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const handleLogout = async () => {
    await authClient.signOut();
    navigate({ to: "/login" });
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex h-12 items-center justify-between px-4">
        <Link className="flex items-center gap-2 text-primary" to="/dashboard">
          <div className="rounded-lg bg-primary/10 p-1.5 ring-1 ring-primary/20">
            <ShieldCheck className="size-5" strokeWidth={2.5} />
          </div>
          <span className="hidden font-bold text-lg sm:inline">au1h</span>
        </Link>

        <div className="flex items-center gap-1">
          <Button asChild className="size-8" size="icon" variant="ghost">
            <Link to="/dashboard">
              <Home className="size-4" />
              <span className="sr-only">Home</span>
            </Link>
          </Button>
          <Button asChild className="size-8" size="icon" variant="ghost">
            <Link to="/docs">
              <BookOpen className="size-4" />
              <span className="sr-only">Documentation</span>
            </Link>
          </Button>
          <Separator orientation="vertical" />
          <Button
            className="size-8"
            onClick={toggleTheme}
            size="icon"
            variant="ghost"
          >
            <Sun className="dark:-rotate-90 size-4 rotate-0 scale-100 transition-all dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Separator orientation="vertical" />
          {user && (
            <>
              <div className="ml-2 flex items-center gap-2">
                <span className="hidden text-sm sm:inline-block">
                  {getFirstName(user.name)}
                </span>
                <Avatar className="size-7">
                  <AvatarImage alt={user.name} src={user.image || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <Separator orientation="vertical" />
              <Button
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
                size="icon"
                variant="ghost"
              >
                <LogOut className="size-4" />
                <span className="sr-only">Logout</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
