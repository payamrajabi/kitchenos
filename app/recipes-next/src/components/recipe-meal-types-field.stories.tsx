import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { RecipeMealTypesField } from "@/components/recipe-meal-types-field";

function StatefulMealTypes(props: { disabled?: boolean }) {
  const [value, setValue] = useState<string[]>(["Dinner", "Lunch"]);
  return (
    <RecipeMealTypesField
      value={value}
      disabled={props.disabled ?? false}
      onCommit={setValue}
    />
  );
}

const meta = {
  title: "KitchenOS/RecipeMealTypesField",
  component: RecipeMealTypesField,
  tags: ["autodocs"],
} satisfies Meta<typeof RecipeMealTypesField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {} as never,
  render: () => <StatefulMealTypes />,
};

export const Disabled: Story = {
  args: {} as never,
  render: () => <StatefulMealTypes disabled />,
};
