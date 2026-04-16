import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IngredientDeleteButton } from "@/components/ingredient-delete-button";

const meta = {
  title: "KitchenOS/IngredientDeleteButton",
  component: IngredientDeleteButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Trash control for an inventory row. In the app it stays hidden until you hover the row; the preview below wraps it in a table row so it stays visible.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="sb-inventory-row-delete-preview table-container inventory-table">
        <table className="ingredients-table">
          <tbody>
            <tr>
              <td style={{ padding: "var(--space-16)" }}>
                <Story />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  ],
} satisfies Meta<typeof IngredientDeleteButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingredientId: 1,
    ingredientName: "Test ingredient",
  },
};
