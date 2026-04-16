import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryTableBody } from "@/components/inventory-table-body";
import { mockIngredient, mockInventoryItem } from "@/lib/storybook/fixtures";
const meta = {
  title: "KitchenOS/InventoryTableBody",
  component: InventoryTableBody,
  tags: ["autodocs"],
} satisfies Meta<typeof InventoryTableBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneIngredient: Story = {
  render: (args) => (
    <div className="table-container inventory-table">
      <table className="ingredients-table inventory-table--compact">
        <InventoryTableBody {...args} />
      </table>
    </div>
  ),
  args: {
    ingredients: [mockIngredient()],
    inventory: [mockInventoryItem({ ingredient_id: 1 })],
    selectedIngredientId: null,
    onSelectIngredient: () => {},
  },
};
