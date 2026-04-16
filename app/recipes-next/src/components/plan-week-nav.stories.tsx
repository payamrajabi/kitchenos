import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { addDaysToDateString } from "@/lib/dates";
import { PlanWeekNav } from "@/components/plan-week-nav";

const meta = {
  title: "KitchenOS/PlanWeekNav",
  component: PlanWeekNav,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanWeekNav>;

export default meta;
type Story = StoryObj<typeof meta>;

const weekStartMonday = "2026-04-13";

export const WeekView: Story = {
  args: {
    weekStart: weekStartMonday,
    dayMode: false,
  },
};

export const DayMode: Story = {
  args: {
    weekStart: weekStartMonday,
    dayMode: true,
    selectedDay: addDaysToDateString(weekStartMonday, 2),
  },
};
