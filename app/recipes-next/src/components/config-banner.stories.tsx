import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConfigBanner } from "@/components/config-banner";

const meta = {
  title: "KitchenOS/ConfigBanner",
  component: ConfigBanner,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Shows only when Supabase URL/key are missing. Storybook stubs those env vars, so this usually renders nothing here.",
      },
    },
  },
} satisfies Meta<typeof ConfigBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StubbedEnvironment: Story = {
  render: () => (
    <div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        With stubbed Supabase env vars, the banner is hidden. Clear env in a
        real build to see the warning layout.
      </p>
      <ConfigBanner />
    </div>
  ),
};
