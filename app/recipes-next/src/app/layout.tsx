import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { ConfigBanner } from "@/components/config-banner";
import { AppToaster } from "@/components/app-toaster";
import { StepTimerWatcher } from "@/components/step-timer-watcher";
import { TimeZoneSync } from "@/components/timezone-sync";

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
    <html lang="en" className={GeistSans.variable}>
      <head>
        <link
          href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <ConfigBanner />
        <AppToaster />
        <StepTimerWatcher />
        <TimeZoneSync />
        {children}
      </body>
    </html>
  );
}
