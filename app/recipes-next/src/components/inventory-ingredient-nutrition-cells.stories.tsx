import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";
import { InventoryIngredientNutritionCells } from "@/components/inventory-ingredient-nutrition-cells";
import { mockIngredient } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/InventoryIngredientNutritionCells",
  component: InventoryIngredientNutritionCells,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryIngredientNutritionCells>;

export default meta;
type Story = StoryObj<typeof meta>;

function NutritionRowStory(
  args: ComponentProps<typeof InventoryIngredientNutritionCells>,
) {
  return (
    <div className="table-container inventory-table">
      <table className="ingredients-table">
        <tbody>
          <tr>
            <InventoryIngredientNutritionCells {...args} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const WithNutrition: Story = {
  args: {
    ingredient: mockIngredient(),
  },
  render: (args) => <NutritionRowStory {...args} />,
};

export const Disabled: Story = {
  args: {
    ingredient: mockIngredient({ name: "Unknown spice" }),
    disabled: true,
  },
  render: (args) => <NutritionRowStory {...args} />,
};
