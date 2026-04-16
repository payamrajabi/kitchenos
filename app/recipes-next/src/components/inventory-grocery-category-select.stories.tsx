import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryGroceryCategorySelect } from "@/components/inventory-grocery-category-select";

const meta = {
  title: "KitchenOS/InventoryGroceryCategorySelect",
  component: InventoryGroceryCategorySelect,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryGroceryCategorySelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingredientId: 1,
    value: "Dairy",
  },
};
