import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

const options = [
  { value: "a", label: "Apples" },
  { value: "b", label: "Bananas" },
  { value: "c", label: "Carrots" },
];

function StatefulSelect(props: {
  initial?: string;
  defaultOpen?: boolean;
  bareInline?: boolean;
}) {
  const [value, setValue] = useState(props.initial ?? "a");
  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={setValue}
      aria-label="Food"
      defaultOpen={props.defaultOpen}
      bareInline={props.bareInline}
    />
  );
}

const meta = {
  title: "KitchenOS/SearchableSelect",
  component: SearchableSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof SearchableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {} as never,
  render: () => <StatefulSelect />,
};

export const Open: Story = {
  args: {} as never,
  render: () => <StatefulSelect defaultOpen />,
};

export const BareInline: Story = {
  args: {} as never,
  render: () => <StatefulSelect bareInline />,
};
