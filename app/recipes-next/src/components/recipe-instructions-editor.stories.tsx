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
        step_number: 1,
        text: "Preheat the oven to 180°C.",
      }),
      mockInstructionStep({
        id: 202,
        step_number: 2,
        text: "Bake until **golden** on top.",
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
        step_number: 1,
        text: "Bring water to a boil.",
      }),
      mockInstructionStep({
        id: 302,
        step_number: 2,
        text: "Cook pasta until al dente.",
        timer_seconds_low: 480,
        timer_seconds_high: 600,
      }),
      mockInstructionStep({
        id: 303,
        step_number: 3,
        text: "Let rest before serving.",
        timer_seconds_low: 180,
        timer_seconds_high: 180,
      }),
    ],
  },
};
