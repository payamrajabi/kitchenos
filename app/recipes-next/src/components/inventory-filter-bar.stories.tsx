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
          "Multi-toggle filters above the inventory table. Each control includes rows that match that dimension; an ingredient stays visible if it matches any enabled toggle (OR).",
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

export const InStockOnly: Story = {
  args: {
    value: {
      inStock: true,
      outOfStock: false,
      recipes: false,
      mealPlan: false,
    },
    onChange: noop,
  },
  render: () => (
    <Interactive
      initial={{
        inStock: true,
        outOfStock: false,
        recipes: false,
        mealPlan: false,
      }}
    />
  ),
};

export const RecipesAndMealPlanOnly: Story = {
  args: {
    value: {
      inStock: false,
      outOfStock: false,
      recipes: true,
      mealPlan: true,
    },
    onChange: noop,
  },
  render: () => (
    <Interactive
      initial={{
        inStock: false,
        outOfStock: false,
        recipes: true,
        mealPlan: true,
      }}
    />
  ),
};
