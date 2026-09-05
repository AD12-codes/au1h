import { Link, useLocation } from "@tanstack/react-router";
import {
  AppWindow,
  BookOpen,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";

const SECTIONS = {
  dashboard: { label: "Dashboard", to: "/dashboard" },
  applications: { label: "Applications", to: "/applications" },
  users: { label: "Users", to: "/users" },
  docs: { label: "Docs", to: "/docs" },
} as const;

type SectionKey = keyof typeof SECTIONS;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

async function logout() {
  try {
    queryClient.clear();
    const themeValue = localStorage.getItem("vite-ui-theme");
    localStorage.clear();
    if (themeValue) {
      localStorage.setItem("vite-ui-theme", themeValue);
    }
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
        onError: () => {
          window.location.href = "/login";
        },
      },
    });
  } catch {
    window.location.href = "/login";
  }
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const [section, sub] = pathname.split("/").filter(Boolean);
  const current =
    section && section in SECTIONS
      ? SECTIONS[section as SectionKey]
      : SECTIONS.dashboard;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link
        className="truncate font-medium text-foreground hover:underline"
        to={current.to}
      >
        {current.label}
      </Link>
      {sub && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="truncate font-mono text-muted-foreground text-xs">
            {sub.length > 14 ? `${sub.slice(0, 8)}…${sub.slice(-4)}` : sub}
          </span>
        </>
      )}
    </div>
  );
}

function MobileNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="md:hidden" size="icon-sm" variant="ghost">
          <Menu className="size-4" />
          <span className="sr-only">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <Link to="/dashboard">
            <LayoutDashboard /> Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/applications">
            <AppWindow /> Applications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/users">
            <Users /> Users
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/docs">
            <BookOpen /> Docs
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70">
      <MobileNav />
      <Breadcrumb />

      <div className="ml-auto flex items-center gap-1">
        {activeOrg && (
          <div className="mr-1 hidden items-center gap-1.5 rounded-md border px-2 py-1 text-muted-foreground text-xs sm:flex">
            <Building2 className="size-3.5" />
            <span className="max-w-[160px] truncate">{activeOrg.name}</span>
          </div>
        )}
        <Button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          size="icon-sm"
          variant="ghost"
        >
          <Sun className="dark:-rotate-90 size-4 rotate-0 scale-100 transition-all dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="ml-1 gap-2 pr-1 pl-1"
                size="sm"
                variant="ghost"
              >
                <Avatar className="size-6">
                  <AvatarImage alt={user.name} src={user.image || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[120px] truncate font-medium text-foreground sm:inline">
                  {user.name}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate font-medium text-sm">{user.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} variant="destructive">
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
