import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeUnitSelect } from "@/components/recipe-unit-select";

const meta = {
  title: "KitchenOS/RecipeUnitSelect",
  component: RecipeUnitSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof RecipeUnitSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingredientId: 1,
    inventoryId: 10,
    stockUnit: "g",
    savedRecipeUnit: "cup",
  },
};
