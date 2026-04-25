import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InventoryCategoryView } from "@/components/inventory-category-view";
import { mockIngredient, mockInventoryItem } from "@/lib/storybook/fixtures";
import type { IngredientRow, InventoryItemRow } from "@/types/database";

const meta = {
  title: "KitchenOS/InventoryCategoryView",
  component: InventoryCategoryView,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof InventoryCategoryView>;

export default meta;
type Story = StoryObj<typeof meta>;

type SeedRow = {
  id: number;
  name: string;
  subcategory: string | null;
  qty?: number;
  parentId?: number;
  variantSortOrder?: number;
};

function build(rows: SeedRow[]): {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
} {
  const ingredients = rows.map((r) =>
    mockIngredient({
      id: r.id,
      name: r.name,
      taxonomy_subcategory: r.subcategory,
      parent_ingredient_id: r.parentId ?? null,
      variant_sort_order: r.variantSortOrder ?? 0,
    }),
  );
  const inventory = rows.map((r) =>
    mockInventoryItem({
      id: 1000 + r.id,
      ingredient_id: r.id,
      quantity: r.qty ?? 0,
    }),
  );
  return { ingredients, inventory };
}

const SEED: SeedRow[] = [
  { id: 1, name: "Garlic", subcategory: "Alliums", qty: 3 },
  { id: 2, name: "Onion", subcategory: "Alliums", qty: 2 },
  { id: 3, name: "Shallot", subcategory: "Alliums" },
  { id: 4, name: "Scallion", subcategory: "Alliums", qty: 1 },
  { id: 10, name: "Tomato", subcategory: "Nightshades", qty: 4 },
  { id: 11, name: "Eggplant", subcategory: "Nightshades" },
  { id: 12, name: "Bell Pepper", subcategory: "Nightshades", qty: 2 },
  { id: 20, name: "Baby Spinach", subcategory: "Leafy Greens", qty: 1 },
  { id: 21, name: "Kale", subcategory: "Leafy Greens" },
  { id: 22, name: "Arugula", subcategory: "Leafy Greens", qty: 1 },
  { id: 23, name: "Romaine", subcategory: "Leafy Greens" },
  { id: 30, name: "Lemon", subcategory: "Citrus", qty: 5 },
  { id: 31, name: "Lime", subcategory: "Citrus", qty: 2 },
  { id: 40, name: "Basil", subcategory: "Fresh Herbs", qty: 1 },
  { id: 41, name: "Cilantro", subcategory: "Fresh Herbs" },
  { id: 42, name: "Parsley", subcategory: "Fresh Herbs", qty: 1 },
  { id: 50, name: "Olive Oil", subcategory: "Oils & Fats", qty: 1 },
  { id: 51, name: "Butter", subcategory: "Oils & Fats", qty: 1 },
  { id: 60, name: "Black Beans", subcategory: "Canned Legumes", qty: 3 },
  { id: 61, name: "Chickpeas", subcategory: "Canned Legumes", qty: 2 },
  { id: 70, name: "Brown Rice", subcategory: "Whole Grains", qty: 1 },
  { id: 71, name: "Quinoa", subcategory: "Whole Grains" },
  { id: 72, name: "Rolled Oats", subcategory: "Whole Grains", qty: 2 },
  { id: 80, name: "Pasta", subcategory: "Pasta & Noodles", qty: 2 },
  { id: 81, name: "Rice Noodles", subcategory: "Pasta & Noodles" },
  { id: 90, name: "Cheddar", subcategory: "Cheese", qty: 1 },
  { id: 91, name: "Parmesan", subcategory: "Cheese", qty: 1 },
  { id: 100, name: "Eggs", subcategory: "Eggs", qty: 12 },
  { id: 110, name: "Chicken Breast", subcategory: "Poultry", qty: 2 },
  { id: 111, name: "Ground Turkey", subcategory: "Poultry" },
  { id: 120, name: "Nutritional Yeast", subcategory: null, qty: 1 },
  { id: 121, name: "Miscellaneous Bits", subcategory: null },
];

export const Default: Story = {
  args: {
    ...build(SEED),
    selectedIngredientId: null,
    onSelectIngredient: () => {},
  },
};

const WITH_VARIANTS: SeedRow[] = [
  { id: 1, name: "Butter", subcategory: "Oils & Fats", qty: 1 },
  {
    id: 2,
    name: "Unsalted Butter",
    subcategory: "Oils & Fats",
    qty: 2,
    parentId: 1,
    variantSortOrder: 0,
  },
  {
    id: 3,
    name: "Salted Butter",
    subcategory: "Oils & Fats",
    parentId: 1,
    variantSortOrder: 1,
  },
  { id: 10, name: "Olive Oil", subcategory: "Oils & Fats", qty: 1 },
  {
    id: 11,
    name: "Extra Virgin Olive Oil",
    subcategory: "Oils & Fats",
    qty: 1,
    parentId: 10,
    variantSortOrder: 0,
  },
  { id: 20, name: "Onion", subcategory: "Alliums", qty: 3 },
  {
    id: 21,
    name: "Red Onion",
    subcategory: "Alliums",
    qty: 1,
    parentId: 20,
    variantSortOrder: 0,
  },
  {
    id: 22,
    name: "Yellow Onion",
    subcategory: "Alliums",
    parentId: 20,
    variantSortOrder: 1,
  },
  {
    id: 23,
    name: "White Onion",
    subcategory: "Alliums",
    qty: 2,
    parentId: 20,
    variantSortOrder: 2,
  },
  { id: 30, name: "Garlic", subcategory: "Alliums", qty: 2 },
];

export const WithVariants: Story = {
  name: "With variants",
  args: {
    ...build(WITH_VARIANTS),
    selectedIngredientId: null,
    onSelectIngredient: () => {},
  },
};

export const TightColumn: Story = {
  name: "Tight 240px column",
  args: {
    ...build(SEED),
    selectedIngredientId: null,
    onSelectIngredient: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};
