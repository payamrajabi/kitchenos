import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeInstructionsEditor } from "@/components/recipe-instructions-editor";
import { mockInstructionStep } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/RecipeInstructionsEditor",
  component: RecipeInstructionsEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="container" style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecipeInstructionsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recipeId: 1,
    recipeName: "Sample Recipe",
    initialSteps: [
      mockInstructionStep({
        id: 201,
        sort_order: 0,
        body: "Preheat the oven to 180°C.",
      }),
      mockInstructionStep({
        id: 202,
        sort_order: 1,
        body: "Bake until **golden** on top.",
      }),
    ],
  },
};

export const WithTimers: Story = {
  args: {
    recipeId: 2,
    recipeName: "Timer Recipe",
    initialSteps: [
      mockInstructionStep({
        id: 301,
        sort_order: 0,
        body: "Bring water to a boil.",
      }),
      mockInstructionStep({
        id: 302,
        sort_order: 1,
        body: "Cook pasta until al dente.",
        timer_seconds_low: 480,
        timer_seconds_high: 600,
      }),
      mockInstructionStep({
        id: 303,
        sort_order: 2,
        body: "Let rest before serving.",
        timer_seconds_low: 180,
        timer_seconds_high: 180,
      }),
    ],
  },
};
