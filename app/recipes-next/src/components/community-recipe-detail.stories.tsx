import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CommunityRecipeDetail } from "@/components/community-recipe-detail";
import {
  mockIngredientSection,
  mockRecipe,
} from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/CommunityRecipeDetail",
  component: CommunityRecipeDetail,
  tags: ["autodocs"],
} satisfies Meta<typeof CommunityRecipeDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CommunityView: Story = {
  args: {
    recipe: mockRecipe({
      name: "Community grain bowl",
      notes: "Great for meal prep.",
    }),
    recipeIngredients: [
      {
        id: 1,
        name: "Quinoa",
        amount: "1",
        unit: "cup",
        is_optional: false,
        section_id: null,
        line_sort_order: 0,
      },
      {
        id: 2,
        name: "Feta",
        amount: "50",
        unit: "g",
        is_optional: true,
        section_id: null,
        line_sort_order: 1,
      },
    ],
    sections: [mockIngredientSection({ id: "main", title: "Main", sort_order: 0 })],
    instructionSteps: [{ body: "Cook quinoa until fluffy." }, { body: "Assemble and serve warm." }],
    alreadySaved: false,
    isOwn: false,
  },
};
