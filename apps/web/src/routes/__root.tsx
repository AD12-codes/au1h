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
import { Toaster } from "@/components/ui/sonner";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "au1h admin",
      },
      {
        name: "description",
        content:
          "au1h admin portal — manage applications, users, sessions and gateway proxy routes.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "au1h admin",
      },
      {
        property: "og:title",
        content: "au1h admin",
      },
      {
        property: "og:description",
        content:
          "au1h admin portal — manage applications, users, sessions and gateway proxy routes.",
      },
      {
        property: "og:image",
        content: "/og-image.png",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "au1h admin",
      },
      {
        name: "twitter:description",
        content:
          "au1h admin portal — manage applications, users, sessions and gateway proxy routes.",
      },
      {
        name: "twitter:image",
        content: "/og-image.png",
      },
      {
        name: "theme-color",
        content: "#2F80FF",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "32x32",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    ],
  }),
});

// Full-bleed pages that render their own chrome.
const BARE_ROUTES = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

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
        <Toaster />
        {import.meta.env.DEV && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </ThemeProvider>
    </>
  );
}
