import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { LimitedRecipeTextField } from "@/components/limited-recipe-text-field";

function StatefulField(props: {
  variant: "ingredients" | "instructions";
  initial?: string;
}) {
  const [value, setValue] = useState(
    props.initial ??
      (props.variant === "instructions"
        ? "1. Preheat the oven.\n2. Mix **dry** ingredients."
        : "2 cups flour\n1 tsp salt"),
  );
  return (
    <LimitedRecipeTextField
      variant={props.variant}
      value={value}
      onChange={setValue}
      onBlur={() => {}}
      ariaLabel={props.variant === "instructions" ? "Instructions" : "Ingredients"}
    />
  );
}

const meta = {
  title: "KitchenOS/LimitedRecipeTextField",
  component: LimitedRecipeTextField,
  tags: ["autodocs"],
} satisfies Meta<typeof LimitedRecipeTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ingredients: Story = {
  args: {} as never,
  render: () => <StatefulField variant="ingredients" />,
};

export const Instructions: Story = {
  args: {} as never,
  render: () => <StatefulField variant="instructions" />,
};
