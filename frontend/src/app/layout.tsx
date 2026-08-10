import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { SiteFooter, SiteHeader } from '@/components/chrome';

export const metadata: Metadata = {
  title: {
    default: 'Productivity Leaderboard',
    template: '%s · Productivity Leaderboard',
  },
  description: 'Weekly productivity leaderboards, badges and monthly champions.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#F6F7F9',
  width: 'device-width',
  initialScale: 1,
};

// Applies a saved theme before first paint so switching to dark never flashes light first.
const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-s1 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
              Skip to content
            </a>
            <SiteHeader />
            <main id="main">{children}</main>
            <SiteFooter />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
