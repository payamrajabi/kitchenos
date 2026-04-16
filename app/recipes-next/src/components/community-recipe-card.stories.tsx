import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CommunityRecipeCard } from "@/components/community-recipe-card";
import { mockRecipe } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/CommunityRecipeCard",
  component: CommunityRecipeCard,
  tags: ["autodocs"],
} satisfies Meta<typeof CommunityRecipeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CommunityCopy: Story = {
  args: {
    recipe: mockRecipe({ name: "Shared pasta bake" }),
    isOwn: false,
  },
};

export const OwnRecipe: Story = {
  args: {
    recipe: mockRecipe({ name: "My breakfast bowl" }),
    isOwn: true,
  },
};
