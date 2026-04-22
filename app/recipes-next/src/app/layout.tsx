import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { ConfigBanner } from "@/components/config-banner";
import { AppToaster } from "@/components/app-toaster";
import { StepTimerWatcher } from "@/components/step-timer-watcher";
import { TimeZoneSync } from "@/components/timezone-sync";
import {
  ThemeProvider,
  THEME_INIT_SCRIPT,
} from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "KitchenOS",
    template: "%s · KitchenOS",
  },
  description: "Recipes, meal plans, inventory, and shopping — powered by Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <link
          href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <ConfigBanner />
          <AppToaster />
          <StepTimerWatcher />
          <TimeZoneSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
