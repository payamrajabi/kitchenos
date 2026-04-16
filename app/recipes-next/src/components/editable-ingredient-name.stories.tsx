import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EditableIngredientName } from "@/components/editable-ingredient-name";

const meta = {
  title: "KitchenOS/EditableIngredientName",
  component: EditableIngredientName,
  tags: ["autodocs"],
} satisfies Meta<typeof EditableIngredientName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingredientId: 1,
    initialName: "Unsalted butter",
  },
};
