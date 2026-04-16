import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlanToolbar } from "@/components/plan-toolbar";

const meta = {
  title: "KitchenOS/PlanToolbar",
  component: PlanToolbar,
  tags: ["autodocs"],
} satisfies Meta<typeof PlanToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
