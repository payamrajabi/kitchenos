import type { StorybookConfig } from "@storybook/nextjs-vite";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      define: {
        ...viteConfig.define,
        "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
          "https://example.supabase.co",
        ),
        "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
          "sb-publishable-storybook-placeholder",
        ),
      },
    });
  },
};

export default config;
