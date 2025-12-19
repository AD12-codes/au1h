import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "@/components/theme-provider";
import "../index.css";
import { Header } from "@/components/layout/header";

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
        content: "au1h is a web application",
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

const ROUTES_WITHOUT_HEADER = ["/login"];

function RootComponent() {
  const location = useLocation();
  const showHeader = !ROUTES_WITHOUT_HEADER.includes(location.pathname);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="flex min-h-svh flex-col">
          {showHeader && <Header />}
          <main className="flex-1">
            <Outlet />
          </main>
        </div>

        <TanStackRouterDevtools position="bottom-left" />
      </ThemeProvider>
    </>
  );
}
