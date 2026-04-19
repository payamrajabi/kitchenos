import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterBar,
  type InventoryFilterState,
} from "@/components/inventory-filter-bar";

const meta = {
  title: "KitchenOS/InventoryFilterBar",
  component: InventoryFilterBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Single-select storage-location filter above the inventory view. All chips visible = no filter; clicking a chip swaps the strip for an X clear button plus the selected chip, matching the recipes meal-filter pattern.",
      },
    },
  },
} satisfies Meta<typeof InventoryFilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ initial }: { initial: InventoryFilterState }) {
  const [value, setValue] = useState<InventoryFilterState>(initial);
  return <InventoryFilterBar value={value} onChange={setValue} />;
}

const noop = () => {};

export const Default: Story = {
  args: { value: DEFAULT_INVENTORY_FILTERS, onChange: noop },
  render: () => <Interactive initial={DEFAULT_INVENTORY_FILTERS} />,
};

export const FridgeSelected: Story = {
  args: { value: "fridge", onChange: noop },
  render: () => <Interactive initial="fridge" />,
};

export const ShallowPantrySelected: Story = {
  args: { value: "shallowPantry", onChange: noop },
  render: () => <Interactive initial="shallowPantry" />,
};
