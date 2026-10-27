import { HomeFooter } from '@/components/home/footer';
import { HomeHeader } from '@/components/home/header';

/**
 * The home page is a single screen on desktop: header, hero and footer share
 * one viewport and nothing scrolls. On small screens it scrolls normally.
 */
export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <div className="relative flex min-h-dvh flex-col lg:h-dvh">
      <div aria-hidden="true" className="au-hero-bg pointer-events-none absolute inset-0" />
      <HomeHeader />
      <main className="relative flex flex-1 flex-col justify-center">{children}</main>
      <HomeFooter />
    </div>
  );
}
