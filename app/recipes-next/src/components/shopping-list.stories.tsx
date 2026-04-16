import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ShoppingList } from "@/components/shopping-list";
import { mockShoppingListItems } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/ShoppingList",
  component: ShoppingList,
  tags: ["autodocs"],
} satisfies Meta<typeof ShoppingList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: mockShoppingListItems(),
  },
};
