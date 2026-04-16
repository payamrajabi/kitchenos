import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeCard } from "@/components/recipe-card";
import { mockRecipe } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/RecipeCard",
  component: RecipeCard,
  tags: ["autodocs"],
} satisfies Meta<typeof RecipeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { recipe: mockRecipe({ name: "Lemon garlic salmon", calories: 380 }) },
};

export const WithoutImage: Story = {
  args: { recipe: mockRecipe({ name: "Simple soup", image_url: null, image_urls: null }) },
};
