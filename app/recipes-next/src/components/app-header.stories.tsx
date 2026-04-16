import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppHeader } from "@/components/app-header";

const meta = {
  title: "KitchenOS/AppHeader",
  component: AppHeader,
  tags: ["autodocs"],
  parameters: {
    /** Fullscreen on individual stories only — on meta it can leave the Docs tab mostly empty below the canvas. */
    nextjs: {
      navigation: { pathname: "/plan" },
    },
    docs: {
      description: {
        component:
          "Top navigation: primary sections, community link, and sign-in / account. Uses live Supabase auth when env is configured.",
      },
    },
  },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnPlan: Story = {
  parameters: {
    layout: "fullscreen",
  },
};

export const OnRecipes: Story = {
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: { pathname: "/recipes" },
    },
  },
};
