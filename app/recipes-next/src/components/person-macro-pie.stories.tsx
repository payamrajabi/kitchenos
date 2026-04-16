import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PersonMacroPie } from "@/components/person-macro-pie";
import { mockMacroCalories } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/PersonMacroPie",
  component: PersonMacroPie,
  tags: ["autodocs"],
} satisfies Meta<typeof PersonMacroPie>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Alex",
    macros: mockMacroCalories(),
  },
};
