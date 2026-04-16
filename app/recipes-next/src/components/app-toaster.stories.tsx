import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppToaster } from "@/components/app-toaster";

const meta = {
  title: "KitchenOS/AppToaster",
  component: AppToaster,
  tags: ["autodocs"],
} satisfies Meta<typeof AppToaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
