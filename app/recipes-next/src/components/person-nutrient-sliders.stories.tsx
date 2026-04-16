import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PersonNutrientSliders } from "@/components/person-nutrient-sliders";
import { mockPerson } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/PersonNutrientSliders",
  component: PersonNutrientSliders,
  tags: ["autodocs"],
} satisfies Meta<typeof PersonNutrientSliders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    person: mockPerson(),
    onError: () => {},
  },
};
