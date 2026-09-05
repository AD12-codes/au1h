import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "@/components/theme-provider";
import "../index.css";
import { AppShell } from "@/components/layout/app-shell";

// biome-ignore lint/complexity/noBannedTypes: <not important>
export type RouterAppContext = {};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "au1h",
      },
      {
        name: "description",
        content: "au1h admin portal",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

// Full-bleed pages that render their own chrome.
const BARE_ROUTES = new Set(["/", "/login", "/register"]);

function RootComponent() {
  const location = useLocation();
  const bare = BARE_ROUTES.has(location.pathname);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {bare ? (
          <Outlet />
        ) : (
          <AppShell>
            <Outlet />
          </AppShell>
        )}
        {import.meta.env.DEV && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </ThemeProvider>
    </>
  );
}
