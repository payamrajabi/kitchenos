import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PersonDetailForm } from "@/components/person-detail-form";
import { mockPerson } from "@/lib/storybook/fixtures";

const meta = {
  title: "KitchenOS/PersonDetailForm",
  component: PersonDetailForm,
  tags: ["autodocs"],
} satisfies Meta<typeof PersonDetailForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    person: mockPerson(),
  },
};
