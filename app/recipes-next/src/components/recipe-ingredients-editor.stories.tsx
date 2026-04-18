import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeIngredientsEditor } from "@/components/recipe-ingredients-editor";
import {
  mockIngredientSection,
  mockRecipeIngredientRow,
} from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/RecipeIngredientsEditor",
  component: RecipeIngredientsEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="container" style={{ maxWidth: 960 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecipeIngredientsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FlatList: Story = {
  args: {
    recipeId: 1,
    initialItems: [
      mockRecipeIngredientRow({
        id: 1,
        line_sort_order: 0,
        amount: "2",
        unit: "tbsp",
        ingredients: { id: 5, name: "Olive oil" },
      }),
    ],
    initialSections: [],
    ingredientOptions: [
      { id: 5, name: "Olive oil" },
      { id: 6, name: "Garlic" },
    ],
  },
};

export const WithSections: Story = {
  args: {
    recipeId: 1,
    initialSections: [
      mockIngredientSection({ id: "a", heading: "Marinade", sort_order: 0 }),
      mockIngredientSection({ id: "b", heading: "Skewers", sort_order: 1 }),
    ],
    initialItems: [
      mockRecipeIngredientRow({
        id: 10,
        section_id: "a",
        line_sort_order: 0,
        amount: "3",
        unit: "tbsp",
        ingredients: { id: 20, name: "Soy sauce" },
      }),
    ],
    ingredientOptions: [{ id: 20, name: "Soy sauce" }, { id: 21, name: "Honey" }],
  },
};
