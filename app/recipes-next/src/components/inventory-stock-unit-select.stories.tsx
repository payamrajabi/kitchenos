import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryStockUnitSelect } from "@/components/inventory-stock-unit-select";

const meta = {
  title: "KitchenOS/InventoryStockUnitSelect",
  component: InventoryStockUnitSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryStockUnitSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingredientId: 1,
    inventoryId: 10,
    value: "g",
  },
};
