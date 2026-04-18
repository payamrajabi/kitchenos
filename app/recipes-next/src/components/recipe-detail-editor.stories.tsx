import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import {
  mockInstructionStep,
  mockRecipe,
  mockRecipeIngredientRow,
} from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/RecipeDetailEditor",
  component: RecipeDetailEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="container" style={{ maxWidth: 960 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecipeDetailEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recipe: mockRecipe({
      name: "Weeknight tacos",
      notes: "Family favorite — double the spice if you like heat.",
    }),
    recipeIngredients: [
      mockRecipeIngredientRow({
        id: 1,
        line_sort_order: 0,
        amount: "400",
        unit: "g",
        ingredients: { id: 10, name: "Ground beef" },
      }),
      mockRecipeIngredientRow({
        id: 2,
        line_sort_order: 1,
        amount: "8",
        unit: "small",
        ingredients: { id: 11, name: "Corn tortillas" },
      }),
    ],
    recipeIngredientSections: [],
    recipeInstructionSteps: [
      mockInstructionStep({
        id: 50,
        step_number: 1,
        text: "Brown the beef with spices.",
      }),
      mockInstructionStep({
        id: 51,
        step_number: 2,
        text: "Warm tortillas and serve.",
      }),
    ],
    availableIngredients: [
      { id: 10, name: "Ground beef" },
      { id: 11, name: "Corn tortillas" },
      { id: 12, name: "Lime" },
    ],
  },
};
