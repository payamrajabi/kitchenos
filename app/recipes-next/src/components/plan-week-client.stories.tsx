import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { addDaysToDateString } from "@/lib/dates";
import { PlanWeekClient } from "@/components/plan-week-client";
import { mockMealPlanEntry } from "@/lib/storybook/fixtures";

const weekStart = "2026-04-13";
const days = Array.from({ length: 7 }, (_, i) => ({
  date: addDaysToDateString(weekStart, i),
}));

const recipes = [
  {
    id: 1,
    name: "Oatmeal",
    meal_types: ["Breakfast"] as string[] | null,
    image_url: null as string | null,
    image_urls: null,
    image_focus_y: null as number | null,
  },
  {
    id: 2,
    name: "Salad",
    meal_types: ["Lunch"] as string[] | null,
    image_url: null,
    image_urls: null,
    image_focus_y: null,
  },
];

const meta = {
  title: "KitchenOS/PlanWeekClient",
  component: PlanWeekClient,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PlanWeekClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeekBoard: Story = {
  args: {
    today: "2026-04-15",
    days,
    entries: [
      mockMealPlanEntry({
        plan_date: "2026-04-15",
        meal_slot: "breakfast",
        recipe_id: 1,
        label: "Oatmeal",
      }),
      mockMealPlanEntry({
        id: 401,
        plan_date: "2026-04-15",
        meal_slot: "lunch",
        recipe_id: 2,
        label: "Salad",
      }),
    ],
    recipes,
    ingredients: [{ id: 10, name: "Lettuce" }],
  },
};
