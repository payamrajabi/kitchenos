import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import "./storybook-overrides.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/plan",
      },
    },
    a11y: {
      test: "todo",
    },
  },
};

export default preview;
