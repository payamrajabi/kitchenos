import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryAddFab } from "@/components/inventory-add-fab";

const meta = {
  title: "KitchenOS/InventoryAddFab",
  component: InventoryAddFab,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryAddFab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
