import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlanMealSlot, type PlanMealSlotProps } from "@/components/plan-meal-slot";
import { mockMealPlanEntry } from "@/lib/storybook/fixtures";

const recipeOpt = {
  id: 1,
  name: "Pasta bake",
  meal_types: ["Dinner"] as string[] | null,
  image_url: null as string | null,
  image_urls: null,
  image_focus_y: null as number | null,
};

const recipeById = new Map([[1, recipeOpt]]);
const recipeByNameLower = new Map([["pasta bake", recipeOpt]]);

const base = {
  day: { date: "2026-04-15", label: "Wed Apr 15" },
  slotKey: "dinner" as const,
  slotLabel: "Dinner",
  cellEntries: [
    mockMealPlanEntry({
      id: 400,
      recipe_id: 1,
      label: "Pasta bake",
      meal_slot: "dinner",
    }),
  ],
  recipeById,
  recipeByNameLower,
  recipes: [recipeOpt],
  ingredients: [{ id: 99, name: "Spinach" }],
  pending: false,
  isOpen: false,
  onAssignOpenRef: () => {},
  onOpen: () => {},
  onKeyDown: () => {},
  commitPick: () => {},
} satisfies PlanMealSlotProps;

const meta = {
  title: "KitchenOS/PlanMealSlot",
  component: PlanMealSlot,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="plan-week-fit" style={{ minHeight: 200 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanMealSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithMeal: Story = {
  args: {
    ...base,
    isOpen: false,
  },
};

export const OpenPicker: Story = {
  args: {
    ...base,
    cellEntries: [],
    isOpen: true,
  },
};
