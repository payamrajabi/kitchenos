import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryQtyField } from "@/components/inventory-qty-field";

const meta = {
  title: "KitchenOS/InventoryQtyField",
  component: InventoryQtyField,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryQtyField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Quantity: Story = {
  args: {
    ingredientId: 1,
    inventoryId: 10,
    field: "quantity",
    initialValue: 3,
    ariaLabel: "Current quantity",
  },
};

export const MinMax: Story = {
  args: {
    ingredientId: 1,
    inventoryId: 10,
    field: "min_quantity",
    initialValue: 1,
    ariaLabel: "Minimum stock",
    maxBound: 10,
  },
};
