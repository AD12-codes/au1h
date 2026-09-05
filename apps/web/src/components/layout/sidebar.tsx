import { Link } from "@tanstack/react-router";
import {
  AppWindow,
  BookOpen,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/applications", label: "Applications", icon: AppWindow },
  { to: "/users", label: "Users", icon: Users },
] as const;

const SECONDARY = [{ to: "/docs", label: "Docs", icon: BookOpen }] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof AppWindow;
  collapsed: boolean;
}) {
  return (
    <Link
      activeOptions={{ exact: false }}
      activeProps={{
        className:
          "bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:text-primary",
      }}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
      to={to}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center border-b px-3",
          collapsed ? "justify-center" : "gap-2"
        )}
      >
        <Link className="flex items-center gap-2" to="/dashboard">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-3.5" strokeWidth={2.5} />
          </span>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight">au1h</span>
          )}
        </Link>
        {!collapsed && (
          <span className="ml-auto rounded border px-1 font-mono text-[10px] text-muted-foreground uppercase">
            admin
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-4 p-2">
        <div className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-2.5 pt-1 pb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              Manage
            </p>
          )}
          {NAV.map((item) => (
            <NavItem collapsed={collapsed} key={item.to} {...item} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-2.5 pt-1 pb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              Resources
            </p>
          )}
          {SECONDARY.map((item) => (
            <NavItem collapsed={collapsed} key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <div className="border-t p-2">
        <Button
          className={cn("w-full justify-start", collapsed && "justify-center")}
          onClick={toggle}
          size="sm"
          variant="ghost"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
