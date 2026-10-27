import { HomeFooter } from '@/components/home/footer';
import { HomeHeader } from '@/components/home/header';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <HomeHeader />
      <main className="flex-1">{children}</main>
      <HomeFooter />
    </>
  );
}
