import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { addDaysToDateString } from "@/lib/dates";
import { PlanWeekBoard } from "@/components/plan-week-board";
import { mockMealPlanEntry } from "@/lib/storybook/fixtures";

const weekStart = "2026-04-13";
const days = Array.from({ length: 7 }, (_, i) => ({
  date: addDaysToDateString(weekStart, i),
}));

const recipes = [
  {
    id: 1,
    name: "Soup",
    meal_types: ["Dinner"] as string[] | null,
    image_url: null as string | null,
    image_urls: null,
    image_focus_y: null as number | null,
  },
];

const meta = {
  title: "KitchenOS/PlanWeekBoard",
  component: PlanWeekBoard,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PlanWeekBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    today: "2026-04-16",
    timeZone: "America/New_York",
    days,
    entries: [
      mockMealPlanEntry({
        id: 500,
        plan_date: "2026-04-16",
        meal_slot: "dinner",
        recipe_id: 1,
        label: "Soup",
      }),
    ],
    recipes,
    ingredients: [{ id: 3, name: "Carrots" }],
  },
};
