import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlanEntryServingsControl } from "@/components/plan-entry-servings-control";

const meta = {
  title: "KitchenOS/PlanEntryServingsControl",
  component: PlanEntryServingsControl,
  tags: ["autodocs"],
} satisfies Meta<typeof PlanEntryServingsControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FourServings: Story = {
  args: {
    entryId: 1,
    servingsProp: 4,
    pendingParent: false,
  },
};

export const SingleServing: Story = {
  args: {
    entryId: 2,
    servingsProp: 1,
    pendingParent: false,
  },
};
