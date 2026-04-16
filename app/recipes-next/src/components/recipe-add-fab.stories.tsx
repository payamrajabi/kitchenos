import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeAddFab } from "@/components/recipe-add-fab";

const meta = {
  title: "KitchenOS/RecipeAddFab",
  component: RecipeAddFab,
  tags: ["autodocs"],
} satisfies Meta<typeof RecipeAddFab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
