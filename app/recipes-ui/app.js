const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const addModal = document.getElementById("addModal");
const addModalTitle = document.getElementById("addModalTitle");
const createButton = document.getElementById("createButton");
const createMenu = document.getElementById("createMenu");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalIngredients = document.getElementById("modalIngredients");
const modalNotes = document.getElementById("modalNotes");
const modalInstructions = document.getElementById("modalInstructions");
const modalSource = document.getElementById("modalSource");
const modalServings = document.getElementById("modalServings");
const modalCalories = document.getElementById("modalCalories");
const modalMacros = document.getElementById("modalMacros");
const modalImage = document.getElementById("modalImage");
const imageInput = document.getElementById("imageInput");
const uploadButton = document.getElementById("uploadButton");
const uploadStatus = document.getElementById("uploadStatus");
const manualForm = document.getElementById("manualForm");
const manualSubmitButton = manualForm.querySelector('button[type="submit"]');
const recipeNameInput = document.getElementById("recipeName");
const sourceUrlInput = document.getElementById("sourceUrl");
const imageUrlInput = document.getElementById("imageUrl");
const servingsInput = document.getElementById("servings");
const caloriesInput = document.getElementById("calories");
const proteinGramsInput = document.getElementById("proteinGrams");
const fatGramsInput = document.getElementById("fatGrams");
const carbsGramsInput = document.getElementById("carbsGrams");
const ingredientsInput = document.getElementById("ingredients");
const instructionsInput = document.getElementById("instructions");
const notesInput = document.getElementById("notes");
const manualStatus = document.getElementById("manualStatus");
const createOptions = document.querySelectorAll("[data-create]");
const viewButtons = document.querySelectorAll(".page-tab-button");
const inventoryCategoryRow = document.getElementById("inventoryCategoryTabs");
const inventoryCategoryButtons = document.querySelectorAll(".secondary-tab-button");
const ingredientModal = document.getElementById("ingredientModal");
const ingredientForm = document.getElementById("ingredientForm");
const ingredientNameInput = document.getElementById("ingredientName");
const ingredientStatus = document.getElementById("ingredientStatus");
const ingredientCreateMore = document.getElementById("ingredientCreateMore");
const ingredientPickerList = document.getElementById("ingredientList");
const ingredientEntries = document.getElementById("ingredientEntries");
const modalRecipeMenu = document.getElementById("modalRecipeMenu");
const modalRecipeMenuButton = document.getElementById("modalRecipeMenuButton");
const modalRecipeMenuDropdown = document.getElementById("modalRecipeMenuDropdown");
const ingredientDetailModal = document.getElementById("ingredientDetailModal");
const ingredientDetailName = document.getElementById("ingredientDetailName");
const ingredientDetailBody = document.getElementById("ingredientDetailBody");
const shopModal = document.getElementById("shopModal");
const shopForm = document.getElementById("shopForm");
const shopItemNameInput = document.getElementById("shopItemName");
const shopItemQuantityInput = document.getElementById("shopItemQuantity");
const shopItemUnitInput = document.getElementById("shopItemUnit");
const shopItemStoreInput = document.getElementById("shopItemStore");
const shopItemAisleInput = document.getElementById("shopItemAisle");
const shopItemNotesInput = document.getElementById("shopItemNotes");
const shopItemStatus = document.getElementById("shopItemStatus");
const shopItemList = document.getElementById("shopItemList");
const shopItemMatchHint = document.getElementById("shopItemMatchHint");
const peopleModal = document.getElementById("peopleModal");
const peopleForm = document.getElementById("peopleForm");
const personNameInput = document.getElementById("personName");
const personBirthDateInput = document.getElementById("personBirthDate");
const personWeightInput = document.getElementById("personWeight");
const personHeightInput = document.getElementById("personHeight");
const personDailyCaloriesInput = document.getElementById("personDailyCalories");
const personCalorieTargetInput = document.getElementById("personCalorieTarget");
const personProteinTargetInput = document.getElementById("personProteinTarget");
const personFatMinInput = document.getElementById("personFatMin");
const personFatMaxInput = document.getElementById("personFatMax");
const personStatus = document.getElementById("personStatus");
const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authModalTitle = document.getElementById("authModalTitle");
const authModalMessage = document.getElementById("authModalMessage");
const authSubmitButton = document.getElementById("authSubmitButton");
const authTabSignIn = document.getElementById("authTabSignIn");
const authTabSignUp = document.getElementById("authTabSignUp");
const authOpenSignInBtn = document.getElementById("authOpenSignIn");
const authOpenSignUpBtn = document.getElementById("authOpenSignUp");
const authHeaderGuest = document.getElementById("authHeaderGuest");
const authHeaderUser = document.getElementById("authHeaderUser");
const userMenuButton = document.getElementById("userMenuButton");
const userMenuDropdown = document.getElementById("userMenuDropdown");
const userMenuEmail = document.getElementById("userMenuEmail");
const userMenuSignOut = document.getElementById("userMenuSignOut");
const userAvatarInitial = document.getElementById("userAvatarInitial");

let authModalMode = "signin";

let allRecipes = [];
let allIngredients = [];
let allInventoryItems = [];
let allShoppingItems = [];
let allEquipment = [];
let allPeople = [];
let currentMealPlan = null;
let activeRecipe = null;
let activeView = "plan";
let activeInventoryCategory =
  inventoryCategoryButtons.length > 0 ? inventoryCategoryButtons[0].dataset.category : "";
let editingRecipeId = null;
let editingPersonId = null;

const VIEW_COPY = {
  plan: {
    message: "Plan your week in one place. Add a meal to get started.",
    actionLabel: "Add meal",
  },
  recipes: {
    message: "Save recipes you want to cook. Start with your first one.",
    actionLabel: "Add recipe manually",
  },
  inventory: {
    message: "Track what you have on hand. Add an ingredient to begin.",
    actionLabel: "Add ingredient",
  },
  equipment: {
    message: "Keep track of your tools and appliances.",
    actionLabel: "Refresh list",
  },
  shop: {
    message:
      "Your shopping list is empty. Add an item, or plan meals to auto-fill it.",
    actionLabel: "Add to list",
  },
  people: {
    message:
      "Add the people you're cooking for to personalize plans and nutrition.",
    actionLabel: "Add person",
  },
};

const SEARCHABLE_VIEWS = new Set(["recipes", "inventory", "people"]);

const PRIMARY_VIEWS = new Set(["plan", "recipes", "inventory", "shop", "people"]);

const INVENTORY_SECONDARY_CATEGORIES = new Set([
  "Fridge",
  "Freezer",
  "Pantry",
  "Equipment",
]);

const EMPTY_ACTIONS = {
  recipes: () => openAddModal(),
  inventory: () => openIngredientModal(),
  equipment: () => loadEquipment(),
  shop: () => openShopModal(),
  people: () => openPeopleModal(),
};

const OPENAI_MODEL_STORAGE = "kitchenos_openai_model";

const supabaseConfig = window.SUPABASE_CONFIG || null;
const openAiConfig = window.OPENAI_CONFIG || {};

const AUTH_EMAIL_STORAGE_KEY = "kitchenos_auth_email";

const isSupabaseConfigured = () => {
  if (!supabaseConfig?.url || !supabaseConfig?.anonKey) return false;
  const url = String(supabaseConfig.url);
  const anonKey = String(supabaseConfig.anonKey);
  if (url.includes("YOUR_PROJECT")) return false;
  if (anonKey.includes("YOUR_ANON_KEY")) return false;
  return true;
};

let sb = null;
let sessionAccessToken = null;

const getRestHeaders = (opts = {}) => {
  if (!supabaseConfig) return {};
  const headers = {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${sessionAccessToken || supabaseConfig.anonKey}`,
    Accept: "application/json",
  };
  if (opts.jsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const getUploadHeaders = () => {
  if (!supabaseConfig) return {};
  return {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${sessionAccessToken || supabaseConfig.anonKey}`,
  };
};

const formatNumber = (value, suffix = "") => {
  if (value === null || value === undefined) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return `${number}${suffix}`;
};

const formatCurrency = (value) => {
  if (value === null || value === undefined) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(number);
};

const formatDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const getWeekStartMonday = (d = new Date()) => {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
};

const getInventoryLocationsForIngredient = (ingredientId) => {
  const locations = new Set();
  allInventoryItems.forEach((row) => {
    if (String(row.ingredient_id) === String(ingredientId)) {
      locations.add(row.storage_location);
    }
  });
  return locations;
};

const ingredientMatchesInventoryTab = (ingredient) => {
  const fromInv = getInventoryLocationsForIngredient(ingredient.id);
  if (fromInv.size > 0) {
    for (const loc of fromInv) {
      if (activeInventoryCategory === "Pantry") {
        if (loc === "Shallow Pantry" || loc === "Deep Pantry") {
          return true;
        }
      } else if (loc === activeInventoryCategory) {
        return true;
      }
    }
    return false;
  }
  return getInventoryGroup(ingredient) === activeInventoryCategory;
};

const loadInventoryItems = async () => {
  try {
    if (!supabaseConfig || !sessionAccessToken) {
      allInventoryItems = [];
      return;
    }
    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/inventory_items?select=*&order=storage_location.asc`,
      { headers: { ...getRestHeaders() } }
    );
    if (!response.ok) {
      throw new Error("Failed to load inventory");
    }
    allInventoryItems = await response.json();
  } catch {
    allInventoryItems = [];
  }
};

/** Units derived from fridge / freezer / pantry items (grams, packs, bags, volume, count, etc.). */
const INVENTORY_STOCK_UNIT_OPTIONS = [
  { value: "count", label: "Count" },
  { value: "g", label: "Grams (g)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "oz", label: "Ounces (oz)" },
  { value: "lb", label: "Pounds (lb)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (l)" },
  { value: "fl oz", label: "Fluid ounces (fl oz)" },
  { value: "cup", label: "Cups" },
  { value: "ea", label: "Each (ea)" },
  { value: "piece", label: "Pieces" },
  { value: "dozen", label: "Dozen" },
  { value: "head", label: "Heads" },
  { value: "pkg", label: "Packages" },
  { value: "bag", label: "Bags" },
  { value: "box", label: "Boxes" },
  { value: "block", label: "Blocks" },
  { value: "tub", label: "Tubs" },
  { value: "bunch", label: "Bunches" },
  { value: "container", label: "Containers" },
  { value: "jar", label: "Jars" },
  { value: "bottle", label: "Bottles" },
  { value: "can", label: "Cans" },
  { value: "roll", label: "Rolls" },
  { value: "sleeve", label: "Sleeves" },
];

const DEFAULT_VENDOR_OPTIONS = [
  "Whole Foods",
  "Eternal Abundance",
  "Donald's Market",
  "Costco",
  "No Frills",
  "Choices",
];

const collectKnownVendors = () => {
  const set = new Set(DEFAULT_VENDOR_OPTIONS);
  for (const ing of allIngredients) {
    if (ing.preferred_vendor) set.add(ing.preferred_vendor);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
};

const RECIPE_EXTRA_UNIT_OPTIONS = [
  { value: "tsp", label: "Teaspoon (tsp)" },
  { value: "tbsp", label: "Tablespoon (tbsp)" },
  { value: "pinch", label: "Pinch" },
  { value: "clove", label: "Cloves" },
  { value: "slice", label: "Slices" },
  { value: "sprig", label: "Sprigs" },
  { value: "stalk", label: "Stalks" },
  { value: "whole", label: "Whole" },
];

const RECIPE_INGREDIENT_UNIT_KNOWN = new Set(
  INVENTORY_STOCK_UNIT_OPTIONS.map((o) => o.value)
);
const RECIPE_INGREDIENT_UNIT_OPTIONS = [
  ...INVENTORY_STOCK_UNIT_OPTIONS,
  ...RECIPE_EXTRA_UNIT_OPTIONS.filter((o) => !RECIPE_INGREDIENT_UNIT_KNOWN.has(o.value)),
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");

const parseLeadingNumber = (text) => {
  if (text === null || text === undefined || text === "") return null;
  const m = String(text).trim().match(/^~?\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
};

const storageLocationMatchesInventoryTab = (storageLocation, tab) => {
  if (tab === "Pantry") {
    return storageLocation === "Shallow Pantry" || storageLocation === "Deep Pantry";
  }
  return storageLocation === tab;
};

const normalizeIngredientStorageCategory = (ingredient) =>
  toOptionalString(ingredient?.category)?.toLowerCase() || "";

const defaultStorageLocationForNewInventoryRow = (ingredient, tab) => {
  if (tab === "Fridge") return "Fridge";
  if (tab === "Freezer") return "Freezer";
  if (tab === "Pantry") {
    const cat = normalizeIngredientStorageCategory(ingredient);
    if (cat === "deep pantry" || cat.startsWith("deep pantry")) {
      return "Deep Pantry";
    }
    return "Shallow Pantry";
  }
  return "Other";
};

const getInventoryRowForIngredientOnTab = (ingredientId, tab) => {
  const idStr = String(ingredientId);
  const rows = allInventoryItems.filter(
    (r) =>
      String(r.ingredient_id) === idStr && storageLocationMatchesInventoryTab(r.storage_location, tab)
  );
  if (!rows.length) return null;
  if (tab === "Pantry") {
    return rows.find((r) => r.storage_location === "Shallow Pantry") || rows[0];
  }
  return rows[0];
};

const mergeInventoryItemInCache = (saved) => {
  if (!saved || saved.id === undefined || saved.id === null) return;
  const idx = allInventoryItems.findIndex((r) => r.id === saved.id);
  if (idx >= 0) {
    allInventoryItems[idx] = { ...allInventoryItems[idx], ...saved };
  } else {
    allInventoryItems.push(saved);
  }
};

const upsertInventoryMerged = async (ingredientId, storageLocation, updates = {}) => {
  if (!supabaseConfig || !sessionAccessToken) return null;
  const existing = allInventoryItems.find(
    (r) =>
      String(r.ingredient_id) === String(ingredientId) &&
      r.storage_location === storageLocation
  );
  const row = {
    ingredient_id: Number(ingredientId),
    storage_location: storageLocation,
    quantity: existing?.quantity ?? null,
    unit: existing?.unit ?? null,
    min_quantity: existing?.min_quantity ?? null,
    max_quantity: existing?.max_quantity ?? null,
    notes: existing?.notes ?? null,
    ...updates,
  };
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/inventory_items?on_conflict=owner_id,ingredient_id,storage_location`,
    {
      method: "POST",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([row]),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to save inventory row");
  }
  const data = await response.json();
  const saved = Array.isArray(data) ? data[0] : data;
  mergeInventoryItemInCache(saved);
  return saved;
};

const upsertInventoryRow = async (ingredientId, storageLocation, extra = {}) => {
  await upsertInventoryMerged(ingredientId, storageLocation, extra);
};

const patchIngredient = async (ingredientId, updates = {}) => {
  if (!supabaseConfig || !sessionAccessToken) return null;
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/ingredients?id=eq.${ingredientId}`,
    {
      method: "PATCH",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to update ingredient");
  }
  const data = await response.json();
  const saved = Array.isArray(data) ? data[0] : data;
  const idx = allIngredients.findIndex((i) => String(i.id) === String(ingredientId));
  if (idx !== -1) Object.assign(allIngredients[idx], saved);
  return saved;
};

const loadCurrentWeekMealPlan = async () => {
  try {
    if (!supabaseConfig || !sessionAccessToken) {
      currentMealPlan = null;
      return;
    }
    const ws = getWeekStartMonday();
    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/meal_plans?week_start=eq.${ws}&select=*,meal_plan_entries(*)`,
      { headers: { ...getRestHeaders() } }
    );
    if (!response.ok) {
      currentMealPlan = null;
      return;
    }
    const rows = await response.json();
    const plan = rows[0] || null;
    if (plan?.meal_plan_entries) {
      plan.meal_plan_entries.sort((a, b) => {
        const da = String(a.plan_date).localeCompare(String(b.plan_date));
        if (da !== 0) return da;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    currentMealPlan = plan;
  } catch {
    currentMealPlan = null;
  }
  if (activeView === "plan") {
    renderActiveList();
  }
};

const ensureMealPlanRowForWeek = async () => {
  if (!supabaseConfig || !sessionAccessToken) return null;
  const ws = getWeekStartMonday();
  if (currentMealPlan?.week_start === ws) {
    return currentMealPlan;
  }
  await loadCurrentWeekMealPlan();
  if (currentMealPlan?.id) {
    return currentMealPlan;
  }
  const response = await fetch(`${supabaseConfig.url}/rest/v1/meal_plans`, {
    method: "POST",
    headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      week_start: ws,
      title: `Week of ${ws}`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Could not create meal plan");
  }
  const created = await response.json();
  currentMealPlan = { ...created[0], meal_plan_entries: [] };
  return currentMealPlan;
};

const replaceMealPlanEntries = async (planId, entries) => {
  const del = await fetch(
    `${supabaseConfig.url}/rest/v1/meal_plan_entries?meal_plan_id=eq.${planId}`,
    {
      method: "DELETE",
      headers: { ...getRestHeaders() },
    }
  );
  if (!del.ok) {
    throw new Error("Failed to clear old plan entries");
  }
  if (!entries.length) {
    return;
  }
  const ins = await fetch(`${supabaseConfig.url}/rest/v1/meal_plan_entries`, {
    method: "POST",
    headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(entries),
  });
  if (!ins.ok) {
    const detail = await ins.text();
    throw new Error(detail || "Failed to save plan entries");
  }
};

const suggestMealPlanWithAi = async () => {
  if (!supabaseConfig || !sessionAccessToken) {
    window.alert("Sign in to use AI meal planning.");
    return;
  }
  const ws = getWeekStartMonday();
  const inventorySummary = allIngredients
    .slice(0, 120)
    .map((i) => `${i.name}:${i.current_stock || ""}`)
    .join("\n");
  const recipeTitles = allRecipes.map((r) => r.name).filter(Boolean);
  const peopleNotes = allPeople
    .map(
      (p) =>
        `${p.name || "Person"} restrictions:${formatListValue(p.dietary_restrictions)} allergies:${formatListValue(p.allergies)}`
    )
    .join("\n");

  try {
    const response = await fetch(
      `${supabaseConfig.url}/functions/v1/openai-kitchen`,
      {
        method: "POST",
        headers: {
          ...getRestHeaders({ jsonBody: true }),
          Authorization: `Bearer ${sessionAccessToken}`,
        },
        body: JSON.stringify({
          mode: "meal_plan",
          model: getOpenAiModel(),
          week_start: ws,
          inventory_summary: inventorySummary,
          recipe_titles: recipeTitles,
          people_notes: peopleNotes,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Meal plan AI failed");
    }
    const result = data.result;
    if (!result?.days?.length) {
      throw new Error("AI returned no days");
    }
    const plan = await ensureMealPlanRowForWeek();
    const planId = plan.id;
    let sort = 0;
    const entries = [];
    result.days.forEach((day) => {
      const date = day.date;
      (day.meals || []).forEach((meal) => {
        const hint = meal.recipe_hint || meal.label;
        let recipeId = null;
        if (hint) {
          const match = allRecipes.find(
            (r) =>
              (r.name || "").toLowerCase() === String(hint).toLowerCase()
          );
          if (match) {
            recipeId = match.id;
          }
        }
        entries.push({
          meal_plan_id: planId,
          plan_date: date,
          meal_slot: meal.meal_slot || "other",
          recipe_id: recipeId,
          label: meal.label || hint || "Meal",
          notes: meal.notes || null,
          sort_order: sort++,
        });
      });
    });
    await replaceMealPlanEntries(planId, entries);
    await loadCurrentWeekMealPlan();
    if (result.shopping_suggestions?.length) {
      window.alert(
        `Plan updated.\n\nShopping ideas:\n${result.shopping_suggestions.slice(0, 8).join("\n")}`
      );
    }
  } catch (error) {
    window.alert(error?.message || "Meal plan failed.");
  }
};

const renderPlanView = () => {
  if (!grid) return;
  if (!sessionAccessToken) {
    grid.innerHTML = "";
    setGridEmptyState(true);
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    wrap.innerHTML =
      "<p class=\"empty-state-message\">Sign in with Supabase Auth to load your meal plan and inventory data.</p>";
    grid.appendChild(wrap);
    return;
  }

  const ws = getWeekStartMonday();
  const entries = currentMealPlan?.meal_plan_entries || [];
  const byDate = new Map();
  entries.forEach((e) => {
    const key = String(e.plan_date).slice(0, 10);
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key).push(e);
  });

  const days = [];
  const start = new Date(`${ws}T12:00:00`);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  setGridEmptyState(false);
  grid.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "plan-week";
  wrap.innerHTML = `
    <div class="plan-week-header">
      <div>
        <h2 class="plan-week-title">Week of ${ws}</h2>
        <p class="plan-week-sub">Meals stored in Supabase. Use AI to draft a week from your inventory and recipes.</p>
      </div>
      <div class="plan-week-actions">
        <button type="button" class="secondary" id="planRefreshBtn">Refresh</button>
        <button type="button" class="primary" id="planAiBtn">AI suggest week</button>
      </div>
    </div>
    <div class="plan-day-columns"></div>
  `;
  const cols = wrap.querySelector(".plan-day-columns");
  days.forEach((dateStr) => {
    const col = document.createElement("div");
    col.className = "plan-day-column";
    const dayEntries = byDate.get(dateStr) || [];
    const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    col.innerHTML = `
      <h3 class="plan-day-title">${label}</h3>
      <div class="plan-day-meals"></div>
    `;
    const mealBox = col.querySelector(".plan-day-meals");
    if (!dayEntries.length) {
      mealBox.innerHTML = `<p class="plan-day-empty">No meals</p>`;
    } else {
      mealBox.innerHTML = dayEntries
        .map(
          (e) => `
        <div class="plan-meal-card">
          <div class="plan-meal-slot">${e.meal_slot || ""}</div>
          <div class="plan-meal-label">${e.label || ""}</div>
          ${e.notes ? `<div class="plan-meal-notes">${e.notes}</div>` : ""}
        </div>
      `
        )
        .join("");
    }
    cols.appendChild(col);
  });
  grid.appendChild(wrap);
  wrap.querySelector("#planRefreshBtn")?.addEventListener("click", () => {
    loadCurrentWeekMealPlan();
  });
  wrap.querySelector("#planAiBtn")?.addEventListener("click", () => {
    suggestMealPlanWithAi();
  });
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
};

const toOptionalString = (value) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
};

const normalizeListValue = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      return trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [String(value)];
};

const formatListValue = (value) => normalizeListValue(value).join(", ");

const normalizeIngredientName = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ");
};

const splitIngredientInput = (value) => {
  if (!value) return [];
  return value
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^[\-\*]+\s*/, ""))
    .map((entry) => entry.replace(/^\d+\.\s+(?=[A-Za-z])/, ""))
    .map(normalizeIngredientName)
    .filter(Boolean);
};

const parseIngredientLine = (line) => {
  const cleaned = normalizeIngredientName(line);
  if (!cleaned) return null;
  const parts = cleaned.split(" ");
  if (parts.length >= 3) {
    const amountCandidate = parts[0];
    const unitCandidate = parts[1];
    if (/[0-9]/.test(amountCandidate) && /^[a-zA-Z]+[a-zA-Z.-]*$/.test(unitCandidate)) {
      return {
        name: parts.slice(2).join(" "),
        amount: amountCandidate,
        unit: unitCandidate,
      };
    }
  }
  return { name: cleaned, amount: "", unit: "" };
};

const normalizeIngredientEntries = (entries) => {
  const seen = new Set();
  return entries
    .map((entry) => ({
      name: normalizeIngredientName(entry.name),
      amount: toOptionalString(entry.amount),
      unit: toOptionalString(entry.unit),
    }))
    .filter((entry) => entry.name)
    .filter((entry) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const formatIngredientEntry = (entry) => {
  const parts = [];
  if (entry.amount) parts.push(entry.amount);
  if (entry.unit) parts.push(entry.unit);
  if (entry.name) parts.push(entry.name);
  return parts.join(" ").trim();
};

const buildIngredientTextFromEntries = (entries) =>
  normalizeIngredientEntries(entries)
    .map(formatIngredientEntry)
    .filter(Boolean)
    .join("\n");

const getIngredientEntriesFromDom = () => {
  if (!ingredientEntries) return [];
  return Array.from(
    ingredientEntries.querySelectorAll(".ingredient-entry:not(.ingredient-entry--scratch)")
  ).map((row) => ({
    name: row.querySelector(".ingredient-entry-name")?.value || "",
    amount: row.querySelector(".ingredient-entry-amount")?.value || "",
    unit: row.querySelector(".ingredient-entry-unit")?.value || "",
  }));
};

const getScratchRow = () =>
  ingredientEntries?.querySelector(".ingredient-entry--scratch") ?? null;

const fillRecipeIngredientUnitSelect = (selectEl, value) => {
  const v = toOptionalString(value);
  const knownValues = new Set(RECIPE_INGREDIENT_UNIT_OPTIONS.map((o) => o.value));
  selectEl.className = "ingredient-entry-unit";
  selectEl.setAttribute("aria-label", "Unit");
  selectEl.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "—";
  selectEl.appendChild(blank);
  RECIPE_INGREDIENT_UNIT_OPTIONS.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  });
  if (v && !knownValues.has(v)) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  selectEl.value = v || "";
};

const ensureScratchRow = () => {
  if (!ingredientEntries || getScratchRow()) return;
  ingredientEntries.appendChild(createIngredientEntryRow({ isScratch: true }));
};

const commitIngredientScratchRow = () => {
  const scratch = getScratchRow();
  if (!scratch || !ingredientEntries) return;
  const nameInput = scratch.querySelector(".ingredient-entry-name");
  const name = normalizeIngredientName(nameInput?.value || "");
  if (!name) {
    nameInput?.focus();
    return;
  }
  const taken = getIngredientEntriesFromDom().map((e) => e.name.toLowerCase());
  if (taken.includes(name.toLowerCase())) {
    window.alert("That ingredient is already in the list.");
    return;
  }
  const amount = scratch.querySelector(".ingredient-entry-amount")?.value?.trim() || "";
  const unit = scratch.querySelector(".ingredient-entry-unit")?.value?.trim() || "";
  scratch.remove();
  addIngredientEntryRow({ name, amount, unit });
  getScratchRow()?.querySelector(".ingredient-entry-name")?.focus();
};

const updateIngredientTextFromEntries = () => {
  if (!ingredientsInput) return { entries: [], text: "" };
  const entries = normalizeIngredientEntries(getIngredientEntriesFromDom());
  const text = buildIngredientTextFromEntries(entries);
  ingredientsInput.value = text;
  return { entries, text };
};

const INGREDIENT_AMOUNT_NUDGE_STEP = 0.25;

const adjustIngredientAmountByStep = (amountInput, direction) => {
  if (!amountInput || (direction !== 1 && direction !== -1)) return;
  const stepAttr = amountInput.getAttribute("step");
  const step =
    stepAttr && stepAttr !== "any"
      ? Math.max(Number(stepAttr), 1e-9)
      : INGREDIENT_AMOUNT_NUDGE_STEP;
  const min = amountInput.min !== "" ? Number(amountInput.min) : 0;
  const raw = amountInput.value.trim();
  let v = raw === "" ? 0 : Number(raw);
  if (Number.isNaN(v)) v = 0;
  const next = Math.max(min, Math.round((v + direction * step) / step) * step);
  const clean = Number(next.toPrecision(12));
  if (clean === 0) {
    amountInput.value = raw === "" ? "" : "0";
  } else {
    amountInput.value = String(parseFloat(clean.toFixed(4)));
  }
  amountInput.dispatchEvent(new Event("input", { bubbles: true }));
};

function createIngredientEntryRow({ name = "", amount = "", unit = "", isScratch = false } = {}) {
  const row = document.createElement("div");
  row.className = `ingredient-entry${isScratch ? " ingredient-entry--scratch" : ""}`;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ingredient-entry-name";
  nameInput.placeholder = "Ingredient";
  nameInput.setAttribute("list", "ingredientList");
  nameInput.value = name;

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.className = "ingredient-entry-amount";
  amountInput.placeholder = "Amount";
  amountInput.min = "0";
  amountInput.step = "any";
  if (amount !== "" && amount !== null && amount !== undefined) {
    const n = Number(amount);
    amountInput.value = Number.isNaN(n) ? "" : String(amount);
  }

  const decAmountBtn = document.createElement("button");
  decAmountBtn.type = "button";
  decAmountBtn.className = "ingredient-amount-btn ingredient-amount-dec";
  decAmountBtn.setAttribute("aria-label", "Decrease amount");
  decAmountBtn.innerHTML = '<i class="ph ph-minus" aria-hidden="true"></i>';
  decAmountBtn.addEventListener("click", () => adjustIngredientAmountByStep(amountInput, -1));

  const incAmountBtn = document.createElement("button");
  incAmountBtn.type = "button";
  incAmountBtn.className = "ingredient-amount-btn ingredient-amount-inc";
  incAmountBtn.setAttribute("aria-label", "Increase amount");
  incAmountBtn.innerHTML = '<i class="ph ph-plus" aria-hidden="true"></i>';
  incAmountBtn.addEventListener("click", () => adjustIngredientAmountByStep(amountInput, 1));

  const amountWrap = document.createElement("div");
  amountWrap.className = "ingredient-amount-wrap";
  amountWrap.append(decAmountBtn, amountInput, incAmountBtn);

  const unitSelect = document.createElement("select");
  fillRecipeIngredientUnitSelect(unitSelect, unit);

  const unitCaret = document.createElement("span");
  unitCaret.className = "ingredient-unit-caret";
  unitCaret.setAttribute("aria-hidden", "true");
  unitCaret.innerHTML = '<i class="ph ph-caret-down"></i>';

  const unitWrap = document.createElement("div");
  unitWrap.className = "ingredient-unit-wrap";
  unitWrap.append(unitSelect, unitCaret);

  const actions = document.createElement("div");
  actions.className = "ingredient-entry-actions";

  if (isScratch) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary button-small ingredient-entry-add";
    addBtn.textContent = "Add ingredient";
    addBtn.addEventListener("click", () => {
      commitIngredientScratchRow();
    });
    actions.appendChild(addBtn);
  } else {
    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.className = "icon-ghost ingredient-entry-link";
    linkButton.setAttribute("aria-label", "Open ingredient");
    linkButton.innerHTML = '<i class="ph ph-arrow-square-out" aria-hidden="true"></i>';

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon-ghost ingredient-entry-remove";
    removeButton.setAttribute("aria-label", "Remove ingredient");
    removeButton.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';

    actions.append(linkButton, removeButton);
  }

  row.append(nameInput, amountWrap, unitWrap, actions);
  return row;
}

const addIngredientEntryRow = (entry) => {
  if (!ingredientEntries) return;
  ingredientEntries.appendChild(createIngredientEntryRow(entry));
  ensureScratchRow();
  updateIngredientTextFromEntries();
};

const setIngredientEntries = (entries) => {
  if (!ingredientEntries) return;
  ingredientEntries.innerHTML = "";
  normalizeIngredientEntries(entries).forEach((entry) => {
    ingredientEntries.appendChild(createIngredientEntryRow(entry));
  });
  ensureScratchRow();
  updateIngredientTextFromEntries();
};

const setIngredientEntriesFromText = (text) => {
  const lines = splitIngredientInput(text);
  const entries = lines.map(parseIngredientLine).filter(Boolean);
  setIngredientEntries(entries);
};

const getIngredientByName = (name) => {
  const normalized = normalizeIngredientName(name).toLowerCase();
  if (!normalized) return null;
  return (
    allIngredients.find((ingredient) => ingredient.name?.toLowerCase() === normalized) ||
    null
  );
};

const findIngredientMatch = (name) => {
  const normalized = normalizeIngredientName(name).toLowerCase();
  if (!normalized) return null;
  return (
    allIngredients.find((ingredient) => {
      const matches = [
        ingredient.name,
        ingredient.full_item_name,
        ingredient.full_item_name_alt,
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      return matches.includes(normalized);
    }) || null
  );
};

const updateIngredientPickerOptions = () => {
  if (!ingredientPickerList) return;
  ingredientPickerList.innerHTML = allIngredients
    .map((ingredient) => `<option value="${ingredient.name}"></option>`)
    .join("");
};

const updateShopItemOptions = () => {
  if (!shopItemList) return;
  shopItemList.innerHTML = allIngredients
    .map((ingredient) => `<option value="${ingredient.name}"></option>`)
    .join("");
};

const setShopAutoValue = (input, value) => {
  if (!input) return;
  const isUserEdited = input.dataset.userEdited === "true";
  if (isUserEdited && input.value.trim()) return;
  input.value = value || "";
  input.dataset.userEdited = "false";
};

const updateShopMatchHint = (ingredient) => {
  if (!shopItemMatchHint) return;
  if (!ingredient) {
    shopItemMatchHint.textContent = "";
    return;
  }
  const vendor = ingredient.preferred_vendor || "No preferred store";
  const aisle = ingredient.category || "Uncategorized aisle";
  shopItemMatchHint.textContent = `Matched in inventory: ${vendor} • ${aisle}`;
};

const syncShopDefaultsFromName = () => {
  if (!shopItemNameInput) return;
  const name = normalizeIngredientName(shopItemNameInput.value);
  const match = findIngredientMatch(name);
  updateShopMatchHint(match);
  if (match) {
    setShopAutoValue(shopItemStoreInput, match.preferred_vendor || "");
    setShopAutoValue(shopItemAisleInput, match.category || "");
  }
};

const getOpenAiModel = () => {
  const fromStorage = localStorage.getItem(OPENAI_MODEL_STORAGE)?.trim() || "";
  const fromConfig = (openAiConfig.model || "").trim();
  return fromStorage || fromConfig || "gpt-4o-mini";
};

const getPrimaryImageUrl = (recipe) => {
  if (recipe.image_url) return recipe.image_url;
  if (Array.isArray(recipe.image_urls) && recipe.image_urls.length) {
    return recipe.image_urls[0];
  }
  return null;
};

const getInitialUrlState = () => {
  const url = new URL(window.location.href);
  let viewName = url.searchParams.get("view");
  const categoryParam = url.searchParams.get("category");

  if (viewName === "equipment") {
    return { view: "inventory", category: "Equipment" };
  }
  if (viewName && PRIMARY_VIEWS.has(viewName)) {
    let category = categoryParam;
    if (category === "Shallow Pantry" || category === "Deep Pantry") {
      category = "Pantry";
    }
    return {
      view: viewName,
      category:
        category && INVENTORY_SECONDARY_CATEGORIES.has(category) ? category : null,
    };
  }
  return null;
};

const syncViewInUrl = (viewName) => {
  const url = new URL(window.location.href);
  if (viewName) {
    url.searchParams.set("view", viewName);
  } else {
    url.searchParams.delete("view");
  }
  url.searchParams.delete("category");
  window.history.replaceState({}, "", url.toString());
};

const setGridEmptyState = (isEmpty) => {
  if (!grid) return;
  grid.classList.toggle("is-empty", Boolean(isEmpty));
};

const getSearchPlaceholder = () => {
  if (activeView === "inventory") return "Search ingredients...";
  if (activeView === "recipes") return "Search recipes...";
  if (activeView === "people") return "Search people...";
  return "Search...";
};

const setActiveInventoryCategory = (category) => {
  if (!category) return;
  activeInventoryCategory = category;
  inventoryCategoryButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.category === category);
  });
  if (activeView === "inventory") {
    searchInput.placeholder = getSearchPlaceholder();
    syncViewInUrl("inventory");
    renderActiveList();
  }
};

const renderEmptyState = (viewName) => {
  if (!grid) return;
  const copy = VIEW_COPY[viewName];
  if (!copy) return;
  grid.innerHTML = "";
  setGridEmptyState(true);
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const action = EMPTY_ACTIONS[viewName];
  const actionButton = action
    ? `<button class="primary" type="button">${copy.actionLabel}</button>`
    : "";
  wrapper.innerHTML = `
    <p class="empty-state-message">${copy.message}</p>
    ${actionButton}
  `;
  if (action) {
    const button = wrapper.querySelector("button");
    button.addEventListener("click", action);
  }
  grid.appendChild(wrapper);
};

const setActiveView = (viewName) => {
  activeView = viewName;
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  searchInput.placeholder = getSearchPlaceholder();
  searchInput.disabled = !SEARCHABLE_VIEWS.has(viewName);
  if (grid) {
    grid.classList.toggle("ingredients-view", viewName === "inventory");
    grid.classList.toggle("equipment-view", false);
    grid.classList.toggle("people-view", viewName === "people");
    grid.classList.toggle("shop-view", viewName === "shop");
  }
  renderActiveList();
  syncViewInUrl(viewName);
};

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

inventoryCategoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveInventoryCategory(button.dataset.category);
  });
});

const openAddModal = () => {
  addModal.classList.add("open");
  addModal.setAttribute("aria-hidden", "false");
  closeCreateMenu();
};

const closeAddModal = () => {
  addModal.classList.remove("open");
  addModal.setAttribute("aria-hidden", "true");
  resetManualFormMode();
};

const openIngredientModal = () => {
  ingredientForm.reset();
  ingredientStatus.textContent = "";
  ingredientModal.classList.add("open");
  ingredientModal.setAttribute("aria-hidden", "false");
  closeCreateMenu();
};

const closeIngredientModal = () => {
  ingredientModal.classList.remove("open");
  ingredientModal.setAttribute("aria-hidden", "true");
};

const openShopModal = () => {
  if (!shopModal || !shopForm) return;
  shopForm.reset();
  if (shopItemStatus) shopItemStatus.textContent = "";
  if (shopItemMatchHint) shopItemMatchHint.textContent = "";
  if (shopItemStoreInput) shopItemStoreInput.dataset.userEdited = "false";
  if (shopItemAisleInput) shopItemAisleInput.dataset.userEdited = "false";
  shopModal.classList.add("open");
  shopModal.setAttribute("aria-hidden", "false");
  closeCreateMenu();
};

const closeShopModal = () => {
  if (!shopModal) return;
  shopModal.classList.remove("open");
  shopModal.setAttribute("aria-hidden", "true");
};

const openPeopleModal = () => {
  if (!peopleModal || !peopleForm) return;
  peopleForm.reset();
  editingPersonId = null;
  if (personStatus) personStatus.textContent = "";
  peopleModal.classList.add("open");
  peopleModal.setAttribute("aria-hidden", "false");
  closeCreateMenu();
};

const closePeopleModal = () => {
  if (!peopleModal) return;
  peopleModal.classList.remove("open");
  peopleModal.setAttribute("aria-hidden", "true");
};

const getCheckedValues = (name) =>
  Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
    (input) => input.value
  );

const closeCreateMenu = () => {
  createMenu.classList.remove("open");
  createButton.setAttribute("aria-expanded", "false");
};

const closeAllRecipeMenus = () => {
  document.querySelectorAll(".recipe-menu-dropdown.open").forEach((menu) => {
    menu.classList.remove("open");
  });
  document.querySelectorAll(".recipe-menu-button").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
};

const toggleRecipeMenu = (menuButton, dropdown) => {
  const isOpen = dropdown.classList.contains("open");
  closeAllRecipeMenus();
  if (!isOpen) {
    dropdown.classList.add("open");
    menuButton.setAttribute("aria-expanded", "true");
  }
};

createButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = createMenu.classList.contains("open");
  if (isOpen) {
    closeCreateMenu();
    return;
  }
  createMenu.classList.add("open");
  createButton.setAttribute("aria-expanded", "true");
});

createOptions.forEach((option) => {
  option.addEventListener("click", () => {
    if (option.dataset.create === "ingredient") {
      openIngredientModal();
      return;
    }
    if (option.dataset.create === "shop") {
      openShopModal();
      return;
    }
    if (option.dataset.create === "recipe") {
      openAddModal();
      return;
    }
  });
});

document.addEventListener("click", (event) => {
  if (!createMenu.contains(event.target) && !createButton.contains(event.target)) {
    closeCreateMenu();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".recipe-menu")) {
    closeAllRecipeMenus();
  }
});

if (ingredientEntries) {
  ingredientEntries.addEventListener("input", () => {
    updateIngredientTextFromEntries();
  });
  ingredientEntries.addEventListener("change", () => {
    updateIngredientTextFromEntries();
  });
  ingredientEntries.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const row = event.target.closest(".ingredient-entry");
    if (!row || !row.classList.contains("ingredient-entry--scratch")) return;
    if (
      !event.target.matches(".ingredient-entry-name, .ingredient-entry-amount, .ingredient-entry-unit")
    ) {
      return;
    }
    event.preventDefault();
    commitIngredientScratchRow();
  });
  ingredientEntries.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".ingredient-entry-remove");
    if (removeButton) {
      const row = removeButton.closest(".ingredient-entry");
      if (row && !row.classList.contains("ingredient-entry--scratch")) {
        row.remove();
        updateIngredientTextFromEntries();
      }
      return;
    }
    const linkButton = event.target.closest(".ingredient-entry-link");
    if (linkButton) {
      const row = linkButton.closest(".ingredient-entry");
      const name = row?.querySelector(".ingredient-entry-name")?.value || "";
      const ingredient = getIngredientByName(name);
      if (ingredient) {
        openIngredientDetailModal(ingredient);
      } else {
        window.alert("Ingredient not found.");
      }
    }
  });
  ensureScratchRow();
}

const renderCards = (recipes) => {
  grid.innerHTML = "";
  if (!recipes.length) {
    renderEmptyState("recipes");
    return;
  }
  setGridEmptyState(false);

  recipes.forEach((recipe) => {
    const card = document.createElement("div");
    const cardImageUrl = getPrimaryImageUrl(recipe);
    card.className = "card";
    card.innerHTML = `
      <div class="card-image">
        ${cardImageUrl ? "" : "Recipe"}
      </div>
      <div class="card-content">
        <h4 class="card-title">${recipe.name}</h4>
        <div class="card-meta">
          ${recipe.calories ? `${recipe.calories} cal` : ""}
          ${recipe.servings ? `${recipe.servings} servings` : ""}
        </div>
      </div>
    `;
    const menu = document.createElement("div");
    menu.className = "recipe-menu";
    menu.innerHTML = `
      <button
        type="button"
        class="recipe-menu-button"
        aria-haspopup="true"
        aria-expanded="false"
        aria-label="Recipe actions"
      >
        <i class="ph ph-dots-three" aria-hidden="true"></i>
      </button>
      <div class="recipe-menu-dropdown" role="menu" aria-label="Recipe actions">
        <button type="button" role="menuitem" data-action="edit">Edit</button>
        <button type="button" role="menuitem" data-action="rename">Rename</button>
        <button type="button" role="menuitem" data-action="duplicate">
          Duplicate
        </button>
        <button type="button" role="menuitem" data-action="delete">Delete</button>
        <button type="button" role="menuitem" data-action="copy-link">
          Copy link
        </button>
      </div>
    `;
    card.appendChild(menu);

    if (cardImageUrl) {
      card.querySelector(".card-image").style.backgroundImage = `url('${cardImageUrl}')`;
      card.querySelector(".card-image").style.backgroundSize = "cover";
      card.querySelector(".card-image").style.backgroundPosition = "center";
      card.querySelector(".card-image").textContent = "";
    }

    const menuButton = menu.querySelector(".recipe-menu-button");
    const dropdown = menu.querySelector(".recipe-menu-dropdown");
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleRecipeMenu(menuButton, dropdown);
    });
    dropdown.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      event.stopPropagation();
      closeAllRecipeMenus();
      handleRecipeAction(action, recipe);
    });

    card.addEventListener("click", () => openModal(recipe));
    grid.appendChild(card);
  });
};

const getInventoryGroup = (ingredient) => {
  const category = toOptionalString(ingredient?.category) || "";
  const normalized = category.toLowerCase();
  if (normalized === "fridge") return "Fridge";
  if (normalized === "freezer") return "Freezer";
  if (normalized === "shallow pantry" || normalized === "deep pantry") return "Pantry";
  if (normalized.startsWith("freezer")) return "Freezer";
  if (normalized.startsWith("fridge")) return "Fridge";
  if (normalized.includes("cleaning") || normalized.includes("laundry")) {
    return "Pantry";
  }
  if (normalized.startsWith("pantry")) {
    return "Pantry";
  }
  return "Pantry";
};

const EQUIPMENT_GROUP_ORDER = [
  "Knives and cutting",
  "Cookware",
  "Bakeware and baking tools",
  "Small appliances",
  "Major appliances",
  "Prep tools and utensils",
  "Storage and organization",
  "Serving and table",
  "Cleaning and safety",
];

const getEquipmentGroup = (item) => toOptionalString(item?.category) || "Other";

const getEquipmentGroupOrder = (group) => {
  const index = EQUIPMENT_GROUP_ORDER.indexOf(group);
  return index === -1 ? EQUIPMENT_GROUP_ORDER.length : index;
};

const formatInventoryQtyDisplay = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  const s = String(rounded);
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
};

const getInventoryStockValues = (ingredient, invRow, tab) => {
  const q =
    invRow?.quantity !== null && invRow?.quantity !== undefined && invRow?.quantity !== ""
      ? Number(invRow.quantity)
      : parseLeadingNumber(ingredient.current_stock);
  const mn =
    invRow?.min_quantity !== null && invRow?.min_quantity !== undefined && invRow?.min_quantity !== ""
      ? Number(invRow.min_quantity)
      : parseLeadingNumber(ingredient.minimum_stock);
  const mx =
    invRow?.max_quantity !== null && invRow?.max_quantity !== undefined && invRow?.max_quantity !== ""
      ? Number(invRow.max_quantity)
      : parseLeadingNumber(ingredient.maximum_stock);
  const unit = invRow?.unit != null && invRow.unit !== "" ? String(invRow.unit) : "";
  const storageLocation =
    invRow?.storage_location || defaultStorageLocationForNewInventoryRow(ingredient, tab);
  return {
    quantity: Number.isNaN(q) ? null : q,
    min: Number.isNaN(mn) ? null : mn,
    max: Number.isNaN(mx) ? null : mx,
    unit,
    storageLocation,
    inventoryId: invRow?.id ?? "",
  };
};

const buildInventoryQtyCell = (field, displayRaw, rawValue) => {
  const show = formatInventoryQtyDisplay(rawValue);
  return `
    <td class="inventory-qty-cell">
      <div class="inventory-qty-wrap" data-field="${field}">
        <button type="button" class="inventory-qty-btn inventory-qty-dec" aria-label="Decrease ${field}" tabindex="-1">−</button>
        <button type="button" class="inventory-qty-value" data-field="${field}" data-raw="${escapeHtml(displayRaw)}" aria-label="Edit ${field}">${escapeHtml(show)}</button>
        <button type="button" class="inventory-qty-btn inventory-qty-inc" aria-label="Increase ${field}" tabindex="-1">+</button>
      </div>
    </td>
  `;
};

const attachInventoryTableHandlers = (tableContainer, ingredientMap) => {
  const rawForDisplay = (v) =>
    v === null || v === undefined || Number.isNaN(v) ? "" : String(v);

  tableContainer.addEventListener("click", async (event) => {
    const nameCell = event.target.closest(".inventory-ingredient-name");
    if (nameCell) {
      const tr = nameCell.closest("tr[data-ingredient-id]");
      const id = tr?.dataset?.ingredientId;
      const ingredient = ingredientMap.get(String(id));
      if (ingredient) {
        openIngredientDetailModal(ingredient);
      }
      return;
    }

    const valueBtn = event.target.closest(".inventory-qty-value");
    if (valueBtn && !valueBtn.classList.contains("is-editing")) {
      event.preventDefault();
      const wrap = valueBtn.closest(".inventory-qty-wrap");
      const field = wrap?.dataset?.field;
      const tr = valueBtn.closest("tr[data-ingredient-id]");
      if (!wrap || !field || !tr) return;
      const ingredient = ingredientMap.get(String(tr.dataset.ingredientId));
      if (!ingredient) return;
      valueBtn.classList.add("is-editing");
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.className = "inventory-qty-input";
      input.value = valueBtn.dataset.raw || "";
      valueBtn.replaceWith(input);
      input.focus();
      input.select();

      let cancelled = false;
      const restoreValueButton = () => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "inventory-qty-value";
        btn.dataset.field = field;
        const invRow = allInventoryItems.find(
          (r) => String(r.ingredient_id) === String(ingredient.id)
        ) || null;
        const stock = getInventoryStockValues(ingredient, invRow, getInventoryGroup(ingredient));
        const raw =
          field === "current"
            ? stock.quantity
            : field === "min"
              ? stock.min
              : stock.max;
        btn.dataset.raw = rawForDisplay(raw);
        btn.textContent = formatInventoryQtyDisplay(raw);
        btn.setAttribute("aria-label", `Edit ${field}`);
        input.replaceWith(btn);
      };

      const commit = async () => {
        if (cancelled) return;
        const trimmed = input.value.trim();
        const next = trimmed === "" ? null : Number(trimmed);
        if (trimmed !== "" && Number.isNaN(next)) {
          restoreValueButton();
          return;
        }
        const storageLocation = tr.dataset.storageLocation;
        const fieldKey =
          field === "current" ? "quantity" : field === "min" ? "min_quantity" : "max_quantity";
        tr.classList.add("inventory-row-saving");
        try {
          if (!supabaseConfig || !sessionAccessToken) {
            window.alert("Sign in to update inventory.");
            restoreValueButton();
            return;
          }
          await upsertInventoryMerged(ingredient.id, storageLocation, { [fieldKey]: next });
          renderActiveList();
        } catch {
          window.alert("Could not save. Run app/database/supabase_migration_inventory_min_max.sql if min/max columns are missing.");
          renderActiveList();
        } finally {
          tr.classList.remove("inventory-row-saving");
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          cancelled = true;
          e.preventDefault();
          restoreValueButton();
        } else if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", () => {
        if (cancelled) return;
        commit();
      });
      return;
    }

    const dec = event.target.closest(".inventory-qty-dec");
    const inc = event.target.closest(".inventory-qty-inc");
    if (!dec && !inc) return;
    event.preventDefault();
    event.stopPropagation();
    const wrap = (dec || inc).closest(".inventory-qty-wrap");
    const tr = wrap?.closest("tr[data-ingredient-id]");
    const field = wrap?.dataset?.field;
    if (!tr || !field) return;
    const ingredient = ingredientMap.get(String(tr.dataset.ingredientId));
    if (!ingredient) return;
    const storageLocation = tr.dataset.storageLocation;
    const invRow = allInventoryItems.find(
      (r) => String(r.ingredient_id) === String(ingredient.id)
    ) || null;
    const stock = getInventoryStockValues(ingredient, invRow, getInventoryGroup(ingredient));
    const fieldKey =
      field === "current" ? "quantity" : field === "min" ? "min_quantity" : "max_quantity";
    const currentVal =
      field === "current" ? stock.quantity : field === "min" ? stock.min : stock.max;
    const base = currentVal === null || Number.isNaN(currentVal) ? 0 : Number(currentVal);
    const delta = inc ? 1 : -1;
    let next = base + delta;
    if (field === "current" && next < 0) next = 0;
    if (field === "min" && next < 0) next = 0;
    if (field === "max" && next < 0) next = 0;
    tr.classList.add("inventory-row-saving");
    try {
      if (!supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to update inventory.");
        return;
      }
      await upsertInventoryMerged(ingredient.id, storageLocation, { [fieldKey]: next });
      renderActiveList();
    } catch {
      window.alert("Could not save. Run app/database/supabase_migration_inventory_min_max.sql if min/max columns are missing.");
      renderActiveList();
    } finally {
      tr.classList.remove("inventory-row-saving");
    }
  });

  tableContainer.addEventListener("change", async (event) => {
    const select = event.target.closest(".inventory-unit-select");
    if (!select) return;
    const tr = select.closest("tr[data-ingredient-id]");
    const ingredient = ingredientMap.get(String(tr?.dataset?.ingredientId));
    if (!ingredient) return;
    const storageLocation = tr.dataset.storageLocation;
    const unit = select.value.trim() || null;
    tr.classList.add("inventory-row-saving");
    try {
      if (!supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to update inventory.");
        select.value = select.dataset.prevUnit || "";
        return;
      }
      await upsertInventoryMerged(ingredient.id, storageLocation, { unit });
      select.dataset.prevUnit = select.value;
      renderActiveList();
    } catch {
      window.alert("Could not save unit.");
      select.value = select.dataset.prevUnit || "";
    } finally {
      tr.classList.remove("inventory-row-saving");
    }
  });

  const commitPrice = async (input) => {
    const tr = input.closest("tr[data-ingredient-id]");
    const ingredient = ingredientMap.get(String(tr?.dataset?.ingredientId));
    if (!ingredient) return;
    const raw = input.value.replace(/[^0-9.]/g, "").trim();
    const prev = input.dataset.prevPrice || "";
    if (raw === prev) return;
    const price = raw === "" ? null : Number(raw);
    if (price !== null && Number.isNaN(price)) { input.value = prev; return; }
    tr.classList.add("inventory-row-saving");
    try {
      if (!supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to update price.");
        input.value = prev;
        return;
      }
      await patchIngredient(ingredient.id, { price });
      const display = price != null ? price.toFixed(2) : "";
      input.value = display;
      input.dataset.prevPrice = display;
    } catch {
      window.alert("Could not save price.");
      input.value = prev;
    } finally {
      tr.classList.remove("inventory-row-saving");
    }
  };

  tableContainer.addEventListener("focusout", (event) => {
    const input = event.target.closest(".inventory-price-input");
    if (input) commitPrice(input);
  });

  tableContainer.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const input = event.target.closest(".inventory-price-input");
    if (!input) return;
    event.preventDefault();
    input.blur();
  });

  tableContainer.addEventListener("change", async (event) => {
    const select = event.target.closest(".inventory-vendor-select");
    if (!select) return;
    const tr = select.closest("tr[data-ingredient-id]");
    const ingredient = ingredientMap.get(String(tr?.dataset?.ingredientId));
    if (!ingredient) return;
    const prev = select.dataset.prevVendor || "";

    if (select.value === "__add_new__") {
      const custom = (window.prompt("Enter a new vendor name:") || "").trim();
      if (!custom) { select.value = prev; return; }
      tr.classList.add("inventory-row-saving");
      try {
        if (!supabaseConfig || !sessionAccessToken) {
          window.alert("Sign in to update vendor.");
          select.value = prev;
          return;
        }
        await patchIngredient(ingredient.id, { preferred_vendor: custom });
        select.dataset.prevVendor = custom;
        renderActiveList();
      } catch {
        window.alert("Could not save vendor.");
        select.value = prev;
      } finally {
        tr.classList.remove("inventory-row-saving");
      }
      return;
    }

    const vendor = select.value || null;
    tr.classList.add("inventory-row-saving");
    try {
      if (!supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to update vendor.");
        select.value = prev;
        return;
      }
      await patchIngredient(ingredient.id, { preferred_vendor: vendor });
      select.dataset.prevVendor = select.value;
    } catch {
      window.alert("Could not save vendor.");
      select.value = prev;
    } finally {
      tr.classList.remove("inventory-row-saving");
    }
  });

  const moveTargets = ["Fridge", "Freezer", "Pantry"].filter((t) => t !== tab);

  let dropdown = document.getElementById("rowMenuDropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.id = "rowMenuDropdown";
    dropdown.className = "row-menu-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.setAttribute("aria-label", "Item actions");
    document.body.appendChild(dropdown);
  }

  let activeMenuTrigger = null;
  let activeIngredientId = null;

  const buildMainMenu = () => `
    <button type="button" role="menuitem" data-row-action="edit" disabled>Edit</button>
    <button type="button" role="menuitem" data-row-action="move">Move to&hellip;</button>
    <button type="button" role="menuitem" data-row-action="delete" class="row-menu-danger">Delete</button>
  `;

  const buildMoveMenu = () => `
    <div class="row-menu-heading">Move to</div>
    ${moveTargets.map((t) => `<button type="button" role="menuitem" data-row-action="move-to" data-move-target="${t}">${t}</button>`).join("")}
    <button type="button" role="menuitem" data-row-action="move-back" class="row-menu-back">&larr; Back</button>
  `;

  const buildConfirmMenu = (name) => `
    <div class="row-menu-heading">Delete ${escapeHtml(name)}?</div>
    <button type="button" role="menuitem" data-row-action="confirm-delete" class="row-menu-danger">Confirm delete</button>
    <button type="button" role="menuitem" data-row-action="cancel-delete" class="row-menu-back">Cancel</button>
  `;

  const positionDropdown = (trigger) => {
    const rect = trigger.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + "px";
    dropdown.style.left = "auto";
    dropdown.style.right = (window.innerWidth - rect.right) + "px";
  };

  const openMenu = (trigger) => {
    const tr = trigger.closest("tr[data-ingredient-id]");
    if (!tr) return;
    activeMenuTrigger = trigger;
    activeIngredientId = tr.dataset.ingredientId;
    dropdown.innerHTML = buildMainMenu();
    positionDropdown(trigger);
    dropdown.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    dropdown.classList.remove("open");
    if (activeMenuTrigger) {
      activeMenuTrigger.setAttribute("aria-expanded", "false");
      activeMenuTrigger = null;
    }
    activeIngredientId = null;
  };

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#rowMenuDropdown") && !e.target.closest(".row-menu-trigger")) {
      closeMenu();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  dropdown.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest("[data-row-action]");
    if (!actionBtn || !activeIngredientId) return;
    const action = actionBtn.dataset.rowAction;
    const ingredient = ingredientMap.get(String(activeIngredientId));
    if (!ingredient) return;
    const tr = tableContainer.querySelector(`tr[data-ingredient-id="${activeIngredientId}"]`);

    if (action === "move") {
      dropdown.innerHTML = buildMoveMenu();
      return;
    }

    if (action === "move-back" || action === "cancel-delete") {
      dropdown.innerHTML = buildMainMenu();
      return;
    }

    if (action === "delete") {
      dropdown.innerHTML = buildConfirmMenu(ingredient.name || "this item");
      return;
    }

    if (action === "move-to") {
      const target = actionBtn.dataset.moveTarget;
      if (!target || !supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to move items.");
        return;
      }
      const storageMap = { Fridge: "Fridge", Freezer: "Freezer", Pantry: "Shallow Pantry" };
      const newLocation = storageMap[target];
      const oldLocation = tr?.dataset?.storageLocation;
      if (tr) tr.classList.add("inventory-row-saving");
      closeMenu();
      try {
        const existing = allInventoryItems.find(
          (r) => String(r.ingredient_id) === String(activeIngredientId) && r.storage_location === oldLocation
        );
        if (existing) {
          const response = await fetch(
            `${supabaseConfig.url}/rest/v1/inventory_items?id=eq.${existing.id}`,
            {
              method: "PATCH",
              headers: { ...getRestHeaders({ jsonBody: true }), Prefer: "return=representation" },
              body: JSON.stringify({ storage_location: newLocation }),
            }
          );
          if (!response.ok) throw new Error(await response.text());
        } else {
          await upsertInventoryMerged(ingredient.id, newLocation, {});
        }
        await loadInventoryItems();
        renderActiveList();
      } catch (err) {
        window.alert("Could not move item: " + (err?.message || "unknown error"));
      }
      return;
    }

    if (action === "confirm-delete") {
      if (!supabaseConfig || !sessionAccessToken) {
        window.alert("Sign in to delete items.");
        return;
      }
      if (tr) tr.classList.add("inventory-row-saving");
      closeMenu();
      try {
        await fetch(
          `${supabaseConfig.url}/rest/v1/inventory_items?ingredient_id=eq.${ingredient.id}`,
          { method: "DELETE", headers: { ...getRestHeaders({ jsonBody: true }) } }
        );
        await fetch(
          `${supabaseConfig.url}/rest/v1/ingredients?id=eq.${ingredient.id}`,
          { method: "DELETE", headers: { ...getRestHeaders({ jsonBody: true }) } }
        );
        allIngredients = allIngredients.filter((i) => String(i.id) !== String(ingredient.id));
        allInventoryItems = allInventoryItems.filter((i) => String(i.ingredient_id) !== String(ingredient.id));
        renderActiveList();
      } catch (err) {
        window.alert("Could not delete: " + (err?.message || "unknown error"));
        renderActiveList();
      }
      return;
    }
  });

  tableContainer.addEventListener("click", (event) => {
    const trigger = event.target.closest(".row-menu-trigger");
    if (!trigger) return;
    event.stopPropagation();
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    closeMenu();
    if (!wasOpen) openMenu(trigger);
  });
};

const renderIngredientTable = (ingredients) => {
  grid.innerHTML = "";
  if (!ingredients.length) {
    renderEmptyState("inventory");
    return;
  }
  setGridEmptyState(false);

  const ingredientMap = new Map(
    ingredients.map((ingredient) => [String(ingredient.id), ingredient])
  );

  const rawForDisplay = (v) =>
    v === null || v === undefined || Number.isNaN(v) ? "" : String(v);

  const sorted = [...ingredients].sort((a, b) => {
    const categoryA = getInventoryGroup(a).toLowerCase();
    const categoryB = getInventoryGroup(b).toLowerCase();
    if (categoryA !== categoryB) {
      return categoryA.localeCompare(categoryB);
    }
    return (a.name || "").localeCompare(b.name || "");
  });

  const vendorList = collectKnownVendors();

  let lastCategory = null;
  const rows = sorted
    .map((ingredient) => {
      const category = getInventoryGroup(ingredient);
      const showCategoryHeader = category !== lastCategory;
      lastCategory = category;
      const headerRow = showCategoryHeader
        ? `
          <tr class="category-row">
            <td colspan="8">${category}</td>
          </tr>
        `
        : "";
      const invRow = allInventoryItems.find(
        (r) => String(r.ingredient_id) === String(ingredient.id)
      ) || null;
      const stock = getInventoryStockValues(ingredient, invRow, getInventoryGroup(ingredient));
      const hasKnownUnit = INVENTORY_STOCK_UNIT_OPTIONS.some((o) => o.value === stock.unit);
      const customUnitOption =
        stock.unit && !hasKnownUnit
          ? `<option value="${escapeHtml(stock.unit)}" selected>${escapeHtml(stock.unit)}</option>`
          : "";
      const unitOptions = [
        customUnitOption,
        `<option value=""${!stock.unit ? " selected" : ""}>${escapeHtml("—")}</option>`,
        ...INVENTORY_STOCK_UNIT_OPTIONS.map((o) => {
          const sel = stock.unit === o.value ? " selected" : "";
          return `<option value="${escapeHtml(o.value)}"${sel}>${escapeHtml(o.label)}</option>`;
        }),
      ].join("");
      const qRaw = stock.quantity;
      const mnRaw = stock.min;
      const mxRaw = stock.max;

      const priceRaw = ingredient.price;
      const priceDisplay = priceRaw != null && priceRaw !== "" && !Number.isNaN(Number(priceRaw))
        ? Number(priceRaw).toFixed(2)
        : "";

      const curVendor = ingredient.preferred_vendor || "";
      const vendorInList = !curVendor || vendorList.includes(curVendor);
      const vendorOptions = [
        `<option value=""${!curVendor ? " selected" : ""}>${escapeHtml("—")}</option>`,
        ...vendorList.map((v) => {
          const sel = curVendor === v ? " selected" : "";
          return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(v)}</option>`;
        }),
        ...(!vendorInList ? [`<option value="${escapeHtml(curVendor)}" selected>${escapeHtml(curVendor)}</option>`] : []),
        `<option value="__add_new__">+ Add new…</option>`,
      ].join("");

      return `
        ${headerRow}
        <tr
          data-ingredient-id="${ingredient.id}"
          data-storage-location="${escapeHtml(stock.storageLocation)}"
          data-inventory-id="${escapeHtml(stock.inventoryId)}"
        >
          <td class="inventory-ingredient-name">${escapeHtml(ingredient.name || "")}</td>
          <td class="inventory-unit-cell">
            <select class="inventory-unit-select" aria-label="Unit for ${escapeHtml(ingredient.name || "ingredient")}" data-prev-unit="${escapeHtml(stock.unit)}">
              ${unitOptions}
            </select>
          </td>
          ${buildInventoryQtyCell("current", rawForDisplay(qRaw), qRaw)}
          ${buildInventoryQtyCell("min", rawForDisplay(mnRaw), mnRaw)}
          ${buildInventoryQtyCell("max", rawForDisplay(mxRaw), mxRaw)}
          <td class="inventory-price-cell">
            <input type="text" inputmode="decimal" class="inventory-price-input" value="${escapeHtml(priceDisplay)}" data-prev-price="${escapeHtml(priceDisplay)}" placeholder="—" aria-label="Price for ${escapeHtml(ingredient.name || "ingredient")}">
          </td>
          <td class="inventory-vendor-cell">
            <select class="inventory-vendor-select" aria-label="Preferred vendor for ${escapeHtml(ingredient.name || "ingredient")}" data-prev-vendor="${escapeHtml(curVendor)}">
              ${vendorOptions}
            </select>
          </td>
          <td class="row-menu-cell">
            <button type="button" class="row-menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Actions for ${escapeHtml(ingredient.name || "ingredient")}">&hellip;</button>
          </td>
        </tr>
      `;
    })
    .join("");

  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container inventory-table";
  tableContainer.innerHTML = `
    <table class="ingredients-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Unit</th>
          <th>Current</th>
          <th>Min</th>
          <th>Max</th>
          <th>Price</th>
          <th>Preferred Vendor</th>
          <th class="row-menu-th"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  grid.appendChild(tableContainer);
  attachInventoryTableHandlers(tableContainer, ingredientMap);
};

const renderEquipmentTable = (equipment) => {
  if (!grid) return;
  grid.innerHTML = "";
  if (!equipment.length) {
    renderEmptyState("equipment");
    return;
  }
  setGridEmptyState(false);

  const equipmentMap = new Map(equipment.map((item) => [String(item.id), item]));
  const sorted = [...equipment].sort((a, b) => {
    const groupA = getEquipmentGroup(a);
    const groupB = getEquipmentGroup(b);
    const orderA = getEquipmentGroupOrder(groupA);
    const orderB = getEquipmentGroupOrder(groupB);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    if (groupA !== groupB) {
      return groupA.localeCompare(groupB);
    }
    return (a.name || "").localeCompare(b.name || "");
  });

  let lastCategory = null;
  const rows = sorted
    .map((item) => {
      const category = getEquipmentGroup(item);
      const showCategoryHeader = category !== lastCategory;
      lastCategory = category;
      const headerRow = showCategoryHeader
        ? `
          <tr class="category-row">
            <td colspan="2">${category}</td>
          </tr>
        `
        : "";
      return `
        ${headerRow}
        <tr data-equipment-id="${item.id}">
          <td>${item.name || ""}</td>
          <td class="equipment-check-cell">
            <label class="equipment-check">
              <input
                type="checkbox"
                data-equipment-id="${item.id}"
                ${item.has_item ? "checked" : ""}
                aria-label="Have ${item.name || "equipment"}"
              />
            </label>
          </td>
        </tr>
      `;
    })
    .join("");

  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container";
  tableContainer.innerHTML = `
    <table class="ingredients-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Have</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  grid.appendChild(tableContainer);

  tableContainer.addEventListener("change", async (event) => {
    const checkbox = event.target.closest(
      'input[type="checkbox"][data-equipment-id]'
    );
    if (!checkbox) return;
    if (!supabaseConfig) {
      window.alert("Supabase config missing.");
      checkbox.checked = !checkbox.checked;
      return;
    }
    const id = checkbox.dataset.equipmentId;
    const equipmentItem = equipmentMap.get(String(id));
    if (!equipmentItem) return;
    const previousValue = Boolean(equipmentItem.has_item);
    const nextValue = checkbox.checked;
    checkbox.disabled = true;
    try {
      const updated = await updateEquipmentItem(id, nextValue);
      equipmentItem.has_item = Boolean(updated?.has_item);
      allEquipment = allEquipment.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item
      );
    } catch (error) {
      checkbox.checked = previousValue;
      window.alert("Unable to update equipment status.");
    } finally {
      checkbox.disabled = false;
    }
  });
};

const getShopGroupValue = (value, fallback) => {
  return toOptionalString(value) || fallback;
};

const renderShopBoard = () => {
  if (!grid) return;
  grid.innerHTML = "";
  if (!allShoppingItems.length) {
    renderEmptyState("shop");
    return;
  }

  setGridEmptyState(false);
  const board = document.createElement("div");
  board.className = "shop-board";
  board.innerHTML = `
    <div class="shop-board-header">
      <div>
        <h2>Shopping list</h2>
        <p>Grouped by store and aisle from your inventory preferences.</p>
      </div>
      <button class="primary" type="button">Add item</button>
    </div>
    <div class="shop-board-columns"></div>
  `;

  const addButton = board.querySelector("button");
  if (addButton) {
    addButton.addEventListener("click", () => openShopModal());
  }

  const columns = board.querySelector(".shop-board-columns");
  const storeMap = new Map();
  allShoppingItems.forEach((item) => {
    const store = getShopGroupValue(item.store, "Unassigned store");
    const aisle = getShopGroupValue(item.aisle, "Uncategorized aisle");
    if (!storeMap.has(store)) {
      storeMap.set(store, new Map());
    }
    const aisleMap = storeMap.get(store);
    if (!aisleMap.has(aisle)) {
      aisleMap.set(aisle, []);
    }
    aisleMap.get(aisle).push(item);
  });

  const sortedStores = Array.from(storeMap.keys()).sort((a, b) => a.localeCompare(b));
  sortedStores.forEach((store) => {
    const aisleMap = storeMap.get(store);
    const storeItems = Array.from(aisleMap.values()).flat();
    const column = document.createElement("div");
    column.className = "shop-column";
    column.innerHTML = `
      <div class="shop-column-header">
        <h3 class="shop-column-title">${store}</h3>
        <span class="shop-column-count">${storeItems.length}</span>
      </div>
      <div class="shop-aisles"></div>
    `;

    const aislesContainer = column.querySelector(".shop-aisles");
    const sortedAisles = Array.from(aisleMap.keys()).sort((a, b) => a.localeCompare(b));
    sortedAisles.forEach((aisle) => {
      const items = aisleMap.get(aisle) || [];
      const sortedItems = [...items].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
      const cards = sortedItems
        .map((item) => {
          const quantity = toOptionalString(item.quantity);
          const unit = toOptionalString(item.unit);
          const meta = [quantity, unit].filter(Boolean).join(" ");
          const notes = toOptionalString(item.notes);
          return `
            <article class="shop-card" data-item-id="${item.id}">
              <div class="shop-card-title">${item.name || "Item"}</div>
              ${meta ? `<div class="shop-card-meta">${meta}</div>` : ""}
              ${notes ? `<div class="shop-card-notes">${notes}</div>` : ""}
            </article>
          `;
        })
        .join("");

      const aisleSection = document.createElement("section");
      aisleSection.className = "shop-aisle";
      aisleSection.innerHTML = `
        <div class="shop-aisle-header">
          <h4 class="shop-aisle-title">${aisle}</h4>
          <span class="shop-aisle-count">${items.length}</span>
        </div>
        <div class="shop-cards">
          ${cards}
        </div>
      `;
      aislesContainer.appendChild(aisleSection);
    });

    columns.appendChild(column);
  });

  grid.appendChild(board);
};

const renderPeopleTable = (people) => {
  if (!grid) return;
  grid.innerHTML = "";
  if (!people.length) {
    renderEmptyState("people");
    return;
  }
  setGridEmptyState(false);

  const sorted = [...people].sort((a, b) => {
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const rows = sorted
    .map((person) => {
      const fatRange =
        person.fat_min_grams || person.fat_max_grams
          ? `${formatNumber(person.fat_min_grams, "g")}–${formatNumber(person.fat_max_grams, "g")} fat`
          : "";
      const macros = [
        person.protein_target_grams
          ? `${formatNumber(person.protein_target_grams, "g")} protein`
          : "",
        fatRange,
      ]
        .filter(Boolean)
        .join(" • ");
      return `
        <tr data-person-id="${person.id}">
          <td>${escapeHtml(person.name || "")}</td>
          <td>${person.birth_date ?? ""}</td>
          <td>${person.weight ?? ""}</td>
          <td>${person.height ?? ""}</td>
          <td>${person.daily_calorie_expenditure ?? ""}</td>
          <td>${person.calorie_target ?? ""}</td>
          <td>${macros}</td>
          <td>${formatListValue(person.dietary_restrictions)}</td>
          <td>${formatListValue(person.allergies)}</td>
          <td class="row-menu-cell">
            <button type="button" class="row-menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Actions for ${escapeHtml(person.name || "person")}">&hellip;</button>
          </td>
        </tr>
      `;
    })
    .join("");

  const board = document.createElement("div");
  board.className = "shop-board";
  board.innerHTML = `
    <div class="shop-board-header">
      <div>
        <h2>People</h2>
        <p>Profiles used for personalized nutrition and plans.</p>
      </div>
      <button class="primary" type="button">Add person</button>
    </div>
  `;
  const addButton = board.querySelector("button");
  if (addButton) {
    addButton.addEventListener("click", () => openPeopleModal());
  }

  const tableContainer = document.createElement("div");
  tableContainer.className = "table-container";
  tableContainer.innerHTML = `
    <table class="ingredients-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Birth date</th>
          <th>Weight (lbs)</th>
          <th>Height (ft/in)</th>
          <th>Daily burn (cals)</th>
          <th>Calorie target (cals)</th>
          <th>Macros</th>
          <th>Dietary restrictions</th>
          <th>Allergies</th>
          <th class="row-menu-th"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  board.appendChild(tableContainer);
  grid.appendChild(board);
  attachPeopleTableHandlers(tableContainer);
};

const openIngredientDetailModal = (ingredient) => {
  if (!ingredientDetailModal || !ingredientDetailName || !ingredientDetailBody) return;
  ingredientDetailName.textContent = ingredient.name || "Ingredient";
  const invLines = allInventoryItems
    .filter((row) => String(row.ingredient_id) === String(ingredient.id))
    .map((row) => {
      const q = row.quantity ?? "";
      const u = row.unit || "";
      const mn =
        row.min_quantity !== null &&
        row.min_quantity !== undefined &&
        row.min_quantity !== ""
          ? ` min ${row.min_quantity}`
          : "";
      const mx =
        row.max_quantity !== null &&
        row.max_quantity !== undefined &&
        row.max_quantity !== ""
          ? ` max ${row.max_quantity}`
          : "";
      return `${row.storage_location}: ${q} ${u}${mn}${mx}`.replace(/\s+/g, " ").trim();
    });
  const fields = [
    ["ID", ingredient.id],
    ["Inventory by location", invLines.length ? invLines.join("; ") : ""],
    ["Category", ingredient.category],
    ["Full item name", ingredient.full_item_name],
    ["Alt name", ingredient.full_item_name_alt],
    ["Current stock", ingredient.current_stock],
    ["Minimum", ingredient.minimum_stock],
    ["Maximum", ingredient.maximum_stock],
    ["Price", formatCurrency(ingredient.price)],
    ["Preferred vendor", ingredient.preferred_vendor],
    ["Brand or manufacturer", ingredient.brand_or_manufacturer],
    ["Notes", ingredient.notes],
    ["Ingredients", ingredient.ingredients_text],
    ["Created", formatDateTime(ingredient.created_at)],
    ["Updated", formatDateTime(ingredient.updated_at)],
  ];
  ingredientDetailBody.innerHTML = fields
    .map(([label, value]) => {
      if (value === null || value === undefined || value === "") return "";
      return `
        <div class="detail-row">
          <div class="detail-label">${label}</div>
          <div class="detail-value">${value}</div>
        </div>
      `;
    })
    .join("");
  ingredientDetailModal.classList.add("open");
  ingredientDetailModal.setAttribute("aria-hidden", "false");
};

const fetchRecipeIngredientLinks = async (recipeId) => {
  if (!supabaseConfig) return [];
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipe_ingredients?select=ingredient_id,amount,unit,ingredients(id,name)&recipe_id=eq.${recipeId}`,
    {
      headers: {
        ...getRestHeaders(),
      },
    }
  );
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.map((row) => ({
    ingredientId: row.ingredient_id,
    name: row.ingredients?.name || "",
    amount: row.amount || "",
    unit: row.unit || "",
  }));
};

const renderRecipeIngredients = (links, fallbackText) => {
  if (!modalIngredients) return;
  modalIngredients.innerHTML = "";
  if (!links || !links.length) {
    modalIngredients.textContent = fallbackText || "Not provided";
    return;
  }
  links.forEach((link) => {
    const row = document.createElement("div");
    row.className = "ingredient-link-row";

    if (link.ingredientId) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ingredient-link";
      button.dataset.ingredientId = String(link.ingredientId);
      button.textContent = link.name || "Ingredient";
      row.appendChild(button);
    } else {
      const name = document.createElement("span");
      name.textContent = link.name || "Ingredient";
      row.appendChild(name);
    }

    const amount = document.createElement("span");
    amount.className = "ingredient-link-amount";
    amount.textContent = link.amount || "";
    row.appendChild(amount);

    const unit = document.createElement("span");
    unit.className = "ingredient-link-unit";
    unit.textContent = link.unit || "";
    row.appendChild(unit);

    modalIngredients.appendChild(row);
  });
};

const renderActiveList = () => {
  const term = searchInput.value.trim().toLowerCase();
  if (activeView === "plan") {
    renderPlanView();
    return;
  }
  if (activeView === "people") {
    const filtered = allPeople.filter((person) => {
      if (!term) return true;
      const haystack = [
        person.name,
        person.birth_date,
        person.weight,
        person.height,
        person.daily_calorie_expenditure,
        person.calorie_target,
        person.protein_target_grams,
        person.fat_min_grams,
        person.fat_max_grams,
        formatListValue(person.dietary_restrictions),
        formatListValue(person.allergies),
      ]
        .filter((value) => value !== null && value !== undefined && value !== "")
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
    renderPeopleTable(filtered);
    return;
  }
  if (activeView === "shop") {
    renderShopBoard();
    return;
  }
  if (activeView === "inventory") {
    const filtered = allIngredients.filter((ingredient) => {
      if (!term) return true;
      const firstInvRow = allInventoryItems.find(
        (r) => String(r.ingredient_id) === String(ingredient.id)
      );
      const stock = getInventoryStockValues(ingredient, firstInvRow || null, "Pantry");
      const invBits = [stock.quantity, stock.min, stock.max, stock.unit]
        .filter((x) => x !== null && x !== undefined && x !== "")
        .join(" ");
      const haystack = [
        ingredient.name,
        ingredient.full_item_name,
        ingredient.full_item_name_alt,
        ingredient.category,
        ingredient.current_stock,
        ingredient.minimum_stock,
        ingredient.maximum_stock,
        invBits,
        ingredient.preferred_vendor,
        ingredient.brand_or_manufacturer,
        ingredient.notes,
        ingredient.ingredients_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
    renderIngredientTable(filtered);
    return;
  }
  const filtered = allRecipes.filter((recipe) =>
    recipe.name.toLowerCase().includes(term)
  );
  renderCards(filtered);
};

const openModal = async (recipe) => {
  activeRecipe = recipe;
  closeAllRecipeMenus();
  modalTitle.textContent = recipe.name;
  renderRecipeIngredients([], recipe.ingredients || "Not provided");
  modalNotes.textContent = recipe.notes || "Not provided";
  modalInstructions.textContent = recipe.instructions || "Not provided";

  modalServings.textContent = recipe.servings
    ? `${recipe.servings} servings`
    : "";
  modalCalories.textContent = recipe.calories
    ? `${recipe.calories} calories`
    : "";
  modalMacros.textContent = [
    recipe.protein_grams ? `${formatNumber(recipe.protein_grams, "g")} protein` : "",
    recipe.fat_grams ? `${formatNumber(recipe.fat_grams, "g")} fat` : "",
    recipe.carbs_grams ? `${formatNumber(recipe.carbs_grams, "g")} carbs` : "",
  ]
    .filter(Boolean)
    .join(" • ");

  if (recipe.source_url) {
    modalSource.href = recipe.source_url;
    modalSource.style.display = "inline-block";
  } else {
    modalSource.style.display = "none";
  }

  const modalImageUrl = getPrimaryImageUrl(recipe);
  if (modalImageUrl) {
    modalImage.style.backgroundImage = `url('${modalImageUrl}')`;
    modalImage.style.backgroundSize = "cover";
    modalImage.style.backgroundPosition = "center";
  } else {
    modalImage.style.backgroundImage = "";
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  uploadStatus.textContent = "";
  imageInput.value = "";

  const links = await fetchRecipeIngredientLinks(recipe.id);
  if (links.length) {
    renderRecipeIngredients(links, recipe.ingredients || "Not provided");
  }
};

const closeModal = () => {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
};

modal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) {
    closeModal();
  }
});

if (modalIngredients) {
  modalIngredients.addEventListener("click", (event) => {
    const linkButton = event.target.closest(".ingredient-link");
    if (!linkButton) return;
    const id = linkButton.dataset.ingredientId;
    const ingredient = allIngredients.find(
      (item) => String(item.id) === String(id)
    );
    if (ingredient) {
      openIngredientDetailModal(ingredient);
    }
  });
}

addModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-add]")) {
    closeAddModal();
  }
});

ingredientModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-ingredient]")) {
    closeIngredientModal();
  }
});

if (shopModal) {
  shopModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-shop]")) {
      closeShopModal();
    }
  });
}

if (peopleModal) {
  peopleModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-people]")) {
      closePeopleModal();
    }
  });
}

if (ingredientDetailModal) {
  ingredientDetailModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-ingredient-detail]")) {
      ingredientDetailModal.classList.remove("open");
      ingredientDetailModal.setAttribute("aria-hidden", "true");
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (document.querySelector(".recipe-menu-dropdown.open")) {
      closeAllRecipeMenus();
      return;
    }
    if (addModal.classList.contains("open")) {
      closeAddModal();
    } else if (ingredientModal.classList.contains("open")) {
      closeIngredientModal();
    } else if (shopModal && shopModal.classList.contains("open")) {
      closeShopModal();
    } else if (peopleModal && peopleModal.classList.contains("open")) {
      closePeopleModal();
    } else if (ingredientDetailModal && ingredientDetailModal.classList.contains("open")) {
      ingredientDetailModal.classList.remove("open");
      ingredientDetailModal.setAttribute("aria-hidden", "true");
    } else {
      closeModal();
    }
  }
});

searchInput.addEventListener("input", (event) => {
  renderActiveList();
});

if (shopItemNameInput) {
  shopItemNameInput.addEventListener("input", () => syncShopDefaultsFromName());
  shopItemNameInput.addEventListener("blur", () => syncShopDefaultsFromName());
}

if (shopItemStoreInput) {
  shopItemStoreInput.addEventListener("input", () => {
    shopItemStoreInput.dataset.userEdited = "true";
  });
}

if (shopItemAisleInput) {
  shopItemAisleInput.addEventListener("input", () => {
    shopItemAisleInput.dataset.userEdited = "true";
  });
}

const loadRecipes = async () => {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }
    if (!sessionAccessToken) {
      allRecipes = [];
      renderActiveList();
      return;
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/recipes?select=*&order=name.asc`,
      {
        headers: {
          ...getRestHeaders(),
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load recipes from Supabase");
    }
    allRecipes = await response.json();
    renderActiveList();
  } catch (error) {
    grid.innerHTML =
      "<p>Unable to load recipes. Check Supabase config and your connection.</p>";
  }
};

const loadIngredients = async () => {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }
    if (!sessionAccessToken) {
      allIngredients = [];
      renderActiveList();
      return;
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/ingredients?select=*&order=name.asc`,
      {
        headers: {
          ...getRestHeaders(),
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load ingredients from Supabase");
    }
    allIngredients = await response.json();
    await loadInventoryItems();
    updateIngredientPickerOptions();
    updateShopItemOptions();
    renderActiveList();
  } catch (error) {
    if (activeView === "inventory") {
      grid.innerHTML =
        "<p>Unable to load ingredients. Check Supabase config and your connection.</p>";
    }
  }
};

async function loadEquipment() {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }
    if (!sessionAccessToken) {
      allEquipment = [];
      return;
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/equipment?select=*&order=category.asc,name.asc`,
      {
        headers: {
          ...getRestHeaders(),
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load equipment from Supabase");
    }
    const equipment = await response.json();
    const ueMap = new Map();
    if (sessionAccessToken) {
      const ueRes = await fetch(
        `${supabaseConfig.url}/rest/v1/user_equipment?select=equipment_id,has_item`,
        { headers: { ...getRestHeaders() } }
      );
      if (ueRes.ok) {
        const urows = await ueRes.json();
        urows.forEach((row) => {
          ueMap.set(String(row.equipment_id), Boolean(row.has_item));
        });
      }
    }
    allEquipment = equipment.map((item) => ({
      ...item,
      has_item: ueMap.has(String(item.id))
        ? ueMap.get(String(item.id))
        : Boolean(item.has_item),
    }));
  } catch (error) {
    // Equipment loading failed silently; equipment view is hidden
  }
}

const loadShoppingItems = async () => {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }
    if (!sessionAccessToken) {
      allShoppingItems = [];
      if (activeView === "shop") {
        renderActiveList();
      }
      return;
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/shopping_items?select=*&order=store.asc,aisle.asc,name.asc`,
      {
        headers: {
          ...getRestHeaders(),
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load shopping items from Supabase");
    }
    allShoppingItems = await response.json();
    if (activeView === "shop") {
      renderActiveList();
    }
  } catch (error) {
    if (activeView === "shop") {
      grid.innerHTML =
        "<p>Unable to load shopping list. Check Supabase config and your connection.</p>";
    }
  }
};

const loadPeople = async () => {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }
    if (!sessionAccessToken) {
      allPeople = [];
      if (activeView === "people") {
        renderActiveList();
      }
      return;
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/people?select=*&order=name.asc`,
      {
        headers: {
          ...getRestHeaders(),
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load people from Supabase");
    }
    allPeople = await response.json();
    if (activeView === "people") {
      renderActiveList();
    }
  } catch (error) {
    if (activeView === "people") {
      grid.innerHTML =
        "<p>Unable to load people. Check Supabase config and your connection.</p>";
    }
  }
};

const buildRecipePayloadFromForm = () => {
  let imageUrls = [];
  if (imageUrlInput.dataset.imageUrls) {
    try {
      const parsed = JSON.parse(imageUrlInput.dataset.imageUrls);
      if (Array.isArray(parsed)) {
        imageUrls = parsed.filter(Boolean);
      }
    } catch (error) {
      imageUrls = [];
    }
  }
  const manualImage = toOptionalString(imageUrlInput.value);
  if (manualImage && !imageUrls.includes(manualImage)) {
    imageUrls.unshift(manualImage);
  }

  return {
    name: recipeNameInput.value.trim(),
    source_url: toOptionalString(sourceUrlInput.value),
    image_url: manualImage,
    image_urls: imageUrls.length ? imageUrls : null,
    servings: toNumberOrNull(servingsInput.value),
    calories: toNumberOrNull(caloriesInput.value),
    protein_grams: toNumberOrNull(proteinGramsInput.value),
    fat_grams: toNumberOrNull(fatGramsInput.value),
    carbs_grams: toNumberOrNull(carbsGramsInput.value),
    ingredients: toOptionalString(ingredientsInput.value),
    instructions: toOptionalString(instructionsInput.value),
    notes: toOptionalString(notesInput.value),
  };
};

const buildPersonPayloadFromForm = () => {
  const dietaryRestrictions = getCheckedValues("dietaryRestrictions");
  const allergies = getCheckedValues("allergies");
  return {
    name: personNameInput?.value.trim() || "",
    birth_date: toOptionalString(personBirthDateInput?.value),
    weight: toNumberOrNull(personWeightInput?.value),
    height: toOptionalString(personHeightInput?.value),
    daily_calorie_expenditure: toNumberOrNull(personDailyCaloriesInput?.value),
    calorie_target: toNumberOrNull(personCalorieTargetInput?.value),
    protein_target_grams: toNumberOrNull(personProteinTargetInput?.value),
    fat_min_grams: toNumberOrNull(personFatMinInput?.value),
    fat_max_grams: toNumberOrNull(personFatMaxInput?.value),
    dietary_restrictions: dietaryRestrictions.length ? dietaryRestrictions : null,
    allergies: allergies.length ? allergies : null,
  };
};

const buildShoppingItemPayload = () => {
  const name = normalizeIngredientName(shopItemNameInput?.value || "");
  const match = findIngredientMatch(name);
  const store =
    toOptionalString(shopItemStoreInput?.value) ||
    toOptionalString(match?.preferred_vendor) ||
    "Unassigned store";
  const aisle =
    toOptionalString(shopItemAisleInput?.value) ||
    toOptionalString(match?.category) ||
    "Uncategorized aisle";
  return {
    name,
    quantity: toOptionalString(shopItemQuantityInput?.value),
    unit: toOptionalString(shopItemUnitInput?.value),
    notes: toOptionalString(shopItemNotesInput?.value),
    store,
    aisle,
    ingredient_id: match?.id || null,
  };
};

const resetManualFormMode = () => {
  editingRecipeId = null;
  addModalTitle.textContent = "Add a recipe";
  manualSubmitButton.textContent = "Save recipe";
  setIngredientEntries([]);
};

const setManualFormModeEdit = () => {
  addModalTitle.textContent = "Edit recipe";
  manualSubmitButton.textContent = "Save changes";
};

const updateRecipeImage = async (recipeId, imageUrl, imageUrls) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipes?id=eq.${recipeId}`,
    {
      method: "PATCH",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        image_urls: imageUrls || null,
      }),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to update recipe image");
  }
  const updated = await response.json();
  return updated[0];
};

const updateRecipe = async (recipeId, payload) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipes?id=eq.${recipeId}`,
    {
      method: "PATCH",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to update recipe");
  }
  const updated = await response.json();
  return updated[0];
};

const updateEquipmentItem = async (equipmentId, hasItem) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/user_equipment?on_conflict=user_id,equipment_id`,
    {
      method: "POST",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          equipment_id: Number(equipmentId),
          has_item: Boolean(hasItem),
        },
      ]),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to update equipment");
  }
  const updated = await response.json();
  return updated[0];
};

const deleteRecipe = async (recipeId) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipes?id=eq.${recipeId}`,
    {
      method: "DELETE",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
      },
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to delete recipe");
  }
};

const createRecipe = async (payload) => {
  const response = await fetch(`${supabaseConfig.url}/rest/v1/recipes`, {
    method: "POST",
    headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to create recipe");
  }
  const created = await response.json();
  return created[0];
};

const createShoppingItem = async (payload) => {
  const response = await fetch(`${supabaseConfig.url}/rest/v1/shopping_items`, {
    method: "POST",
    headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to create shopping item");
  }
  const created = await response.json();
  return created[0];
};

const createPerson = async (payload) => {
  const response = await fetch(`${supabaseConfig.url}/rest/v1/people`, {
    method: "POST",
    headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to create person");
  }
  const created = await response.json();
  return created[0];
};

const buildRecipeLink = (recipe) => {
  const url = new URL(window.location.href);
  url.searchParams.set("recipeId", recipe.id);
  return url.toString();
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const showRecipeActionStatus = (message) => {
  if (modal.classList.contains("open")) {
    uploadStatus.textContent = message;
    window.setTimeout(() => {
      if (uploadStatus.textContent === message) {
        uploadStatus.textContent = "";
      }
    }, 2400);
    return;
  }
  window.alert(message);
};

const populateIngredientEntriesForRecipe = async (recipe) => {
  if (!recipe) return;
  let links = [];
  if (supabaseConfig) {
    links = await fetchRecipeIngredientLinks(recipe.id);
  }
  if (links.length) {
    setIngredientEntries(
      links.map((link) => ({
        name: link.name,
        amount: link.amount,
        unit: link.unit,
      }))
    );
    return;
  }
  setIngredientEntriesFromText(recipe.ingredients || "");
};

const openEditModal = async (recipe) => {
  if (!recipe) return;
  editingRecipeId = recipe.id;
  setManualFormModeEdit();
  recipeNameInput.value = recipe.name || "";
  sourceUrlInput.value = recipe.source_url || "";
  imageUrlInput.value = recipe.image_url || "";
  imageUrlInput.dataset.imageUrls = Array.isArray(recipe.image_urls)
    ? JSON.stringify(recipe.image_urls)
    : "";
  servingsInput.value = recipe.servings ?? "";
  caloriesInput.value = recipe.calories ?? "";
  proteinGramsInput.value = recipe.protein_grams ?? "";
  fatGramsInput.value = recipe.fat_grams ?? "";
  carbsGramsInput.value = recipe.carbs_grams ?? "";
  setIngredientEntriesFromText(recipe.ingredients || "");
  instructionsInput.value = recipe.instructions || "";
  notesInput.value = recipe.notes || "";
  await populateIngredientEntriesForRecipe(recipe);
  openAddModal();
};

const handleRecipeAction = async (action, recipe) => {
  if (!recipe || !supabaseConfig) {
    if (!supabaseConfig) {
      showRecipeActionStatus("Supabase config missing.");
    }
    return;
  }

  if (action === "edit") {
    closeModal();
    await openEditModal(recipe);
    return;
  }

  if (action === "rename") {
    const nextName = window.prompt("New recipe name:", recipe.name || "");
    if (!nextName || !nextName.trim() || nextName.trim() === recipe.name) {
      return;
    }
    try {
      const updated = await updateRecipe(recipe.id, { name: nextName.trim() });
      allRecipes = allRecipes
        .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (activeRecipe && activeRecipe.id === updated.id) {
        activeRecipe = { ...activeRecipe, ...updated };
        if (modal.classList.contains("open")) {
          openModal(activeRecipe);
        }
      }
      renderActiveList();
    } catch (error) {
      showRecipeActionStatus(
        error?.message ? `Rename failed: ${error.message}` : "Rename failed."
      );
    }
    return;
  }

  if (action === "duplicate") {
    try {
      const payload = {
        name: recipe.name ? `Copy of ${recipe.name}` : "Copy of recipe",
        source_url: recipe.source_url || null,
        image_url: recipe.image_url || null,
        image_urls: Array.isArray(recipe.image_urls) ? recipe.image_urls : null,
        servings: recipe.servings ?? null,
        calories: recipe.calories ?? null,
        protein_grams: recipe.protein_grams ?? null,
        fat_grams: recipe.fat_grams ?? null,
        carbs_grams: recipe.carbs_grams ?? null,
        ingredients: recipe.ingredients || null,
        instructions: recipe.instructions || null,
        notes: recipe.notes || null,
      };
      const created = await createRecipe(payload);
      const duplicateEntries = splitIngredientInput(created.ingredients || "")
        .map(parseIngredientLine)
        .filter(Boolean);
      await syncIngredientsForRecipe(created.id, duplicateEntries);
      allRecipes = [...allRecipes, created].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      renderActiveList();
      openModal(created);
    } catch (error) {
      showRecipeActionStatus(
        error?.message
          ? `Duplicate failed: ${error.message}`
          : "Duplicate failed."
      );
    }
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      "Delete this recipe? This cannot be undone."
    );
    if (!confirmed) return;
    try {
      await deleteRecipe(recipe.id);
      allRecipes = allRecipes.filter((item) => item.id !== recipe.id);
      renderActiveList();
      if (activeRecipe && activeRecipe.id === recipe.id) {
        closeModal();
        activeRecipe = null;
      }
    } catch (error) {
      showRecipeActionStatus(
        error?.message ? `Delete failed: ${error.message}` : "Delete failed."
      );
    }
    return;
  }

  if (action === "copy-link") {
    try {
      const url = buildRecipeLink(recipe);
      await copyTextToClipboard(url);
      showRecipeActionStatus("Link copied.");
    } catch (error) {
      showRecipeActionStatus("Copy failed.");
    }
  }
};

const upsertIngredients = async (names) => {
  if (!names.length) return [];
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/ingredients?on_conflict=owner_id,name`,
    {
      method: "POST",
      headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(names.map((name) => ({ name }))),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to upsert ingredients");
  }
  return response.json();
};

const fetchIngredientIdsByName = async (names) => {
  if (!names.length) return [];
  const encodedNames = names
    .map((name) => `"${name.replace(/"/g, '\\"')}"`)
    .map((name) => encodeURIComponent(name))
    .join(",");
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/ingredients?select=id,name&name=in.(${encodedNames})`,
    {
      headers: {
        ...getRestHeaders(),
      },
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to load ingredients");
  }
  return response.json();
};

const linkRecipeIngredients = async (recipeId, links) => {
  if (!links.length) return;
  const payload = links.map((link) => ({
    recipe_id: recipeId,
    ingredient_id: link.ingredient_id,
    amount: toOptionalString(link.amount),
    unit: toOptionalString(link.unit),
  }));
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipe_ingredients?on_conflict=recipe_id,ingredient_id`,
    {
      method: "POST",
      headers: {
      ...getRestHeaders({ jsonBody: true }),
      Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to link recipe ingredients");
  }
};

const deleteRecipeIngredientLinks = async (recipeId) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipe_ingredients?recipe_id=eq.${recipeId}`,
    {
      method: "DELETE",
      headers: {
        ...getRestHeaders({ jsonBody: true }),
      },
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to clear recipe ingredients");
  }
};

const syncIngredientsForRecipe = async (recipeId, entries) => {
  const normalizedEntries = normalizeIngredientEntries(entries || []);
  await deleteRecipeIngredientLinks(recipeId);
  if (!normalizedEntries.length) {
    await loadIngredients();
    return;
  }
  const names = normalizedEntries.map((entry) => entry.name);
  await upsertIngredients(names);
  const ingredients = await fetchIngredientIdsByName(names);
  const ingredientIdMap = new Map(
    ingredients.map((item) => [item.name.toLowerCase(), item.id])
  );
  const links = normalizedEntries
    .map((entry) => {
      const id = ingredientIdMap.get(entry.name.toLowerCase());
      if (!id) return null;
      return {
        ingredient_id: id,
        amount: entry.amount,
        unit: entry.unit,
      };
    })
    .filter(Boolean);
  await linkRecipeIngredients(recipeId, links);
  await loadIngredients();
};

const uploadImage = async (file) => {
  const ext = file.name.split(".").pop() || "jpg";
  const safeName = `${activeRecipe.id}-${Date.now()}.${ext}`;
  const path = `${safeName}`;
  const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${supabaseConfig.bucket}/${path}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...getUploadHeaders(),
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Upload failed");
  }

  return `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.bucket}/${path}`;
};

uploadButton.addEventListener("click", async () => {
  if (!activeRecipe) {
    return;
  }
  if (!imageInput.files || !imageInput.files.length) {
    uploadStatus.textContent = "Choose an image first.";
    return;
  }
  if (!supabaseConfig) {
    uploadStatus.textContent = "Supabase config missing.";
    return;
  }

  uploadStatus.textContent = "Uploading...";
  try {
    const file = imageInput.files[0];
    const imageUrl = await uploadImage(file);
    const existing = Array.isArray(activeRecipe.image_urls)
      ? activeRecipe.image_urls
      : [];
    const nextImages = [imageUrl, ...existing.filter((url) => url !== imageUrl)];
    const updated = await updateRecipeImage(
      activeRecipe.id,
      imageUrl,
      nextImages
    );

    activeRecipe.image_url = updated.image_url;
    activeRecipe.image_urls = updated.image_urls || nextImages;
    renderCards(allRecipes);
    openModal(activeRecipe);

    uploadStatus.textContent = "Upload complete.";
  } catch (error) {
    uploadStatus.textContent = "Upload failed.";
  }
});

manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseConfig) {
    manualStatus.textContent = "Supabase config missing.";
    return;
  }

  manualStatus.textContent = "Saving...";
  try {
    const { entries: ingredientEntriesData } = updateIngredientTextFromEntries();
    const payload = buildRecipePayloadFromForm();

    if (editingRecipeId) {
      const updated = await updateRecipe(editingRecipeId, payload);
      await syncIngredientsForRecipe(updated.id, ingredientEntriesData);
      allRecipes = allRecipes
        .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (activeRecipe && activeRecipe.id === updated.id) {
        activeRecipe = { ...activeRecipe, ...updated };
        if (modal.classList.contains("open")) {
          openModal(activeRecipe);
        }
      }
      renderActiveList();
      manualForm.reset();
      setIngredientEntries([]);
      imageUrlInput.dataset.imageUrls = "";
      manualStatus.textContent = "Recipe updated.";
      closeAddModal();
      resetManualFormMode();
      return;
    }

    const created = await createRecipe(payload);
    await syncIngredientsForRecipe(created.id, ingredientEntriesData);
    allRecipes = [...allRecipes, created].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    renderActiveList();
    manualForm.reset();
    setIngredientEntries([]);
    imageUrlInput.dataset.imageUrls = "";
    manualStatus.textContent = "Recipe added.";
    closeAddModal();
    resetManualFormMode();
  } catch (error) {
    manualStatus.textContent = error?.message
      ? `Save failed: ${error.message}`
      : "Save failed.";
  }
});

ingredientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseConfig) {
    ingredientStatus.textContent = "Supabase config missing.";
    return;
  }
  const name = normalizeIngredientName(ingredientNameInput.value);
  if (!name) {
    ingredientStatus.textContent = "Add an ingredient name.";
    return;
  }
  ingredientStatus.textContent = "Saving...";
  try {
    const created = await upsertIngredients([name]);
    await loadIngredients();
    const newId =
      Array.isArray(created) && created[0]?.id
        ? created[0].id
        : allIngredients.find(
            (i) => i.name && i.name.toLowerCase() === name.toLowerCase()
          )?.id;
    if (newId && activeView === "inventory") {
      const newIngredient =
        allIngredients.find(
          (i) => i.name && i.name.toLowerCase() === name.toLowerCase()
        ) || {};
      await upsertInventoryRow(
        newId,
        defaultStorageLocationForNewInventoryRow(newIngredient, getInventoryGroup(newIngredient))
      );
      await loadInventoryItems();
    }
    renderActiveList();
    ingredientStatus.textContent = "Ingredient added.";
    if (ingredientCreateMore?.checked) {
      ingredientNameInput.value = "";
      ingredientNameInput.focus();
    } else {
      closeIngredientModal();
    }
  } catch (error) {
    ingredientStatus.textContent = error?.message
      ? `Save failed: ${error.message}`
      : "Save failed.";
  }
});

if (shopForm) {
  shopForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseConfig) {
      shopItemStatus.textContent = "Supabase config missing.";
      return;
    }
    const payload = buildShoppingItemPayload();
    if (!payload.name) {
      shopItemStatus.textContent = "Add an item name.";
      return;
    }
    shopItemStatus.textContent = "Saving...";
    try {
      await createShoppingItem(payload);
      await loadShoppingItems();
      shopItemStatus.textContent = "Item added.";
      closeShopModal();
    } catch (error) {
      shopItemStatus.textContent = error?.message
        ? `Save failed: ${error.message}`
        : "Save failed.";
    }
  });
}

if (peopleForm) {
  peopleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseConfig) {
      personStatus.textContent = "Supabase config missing.";
      return;
    }
    const payload = buildPersonPayloadFromForm();
    if (!payload.name) {
      personStatus.textContent = "Add a name.";
      return;
    }
    personStatus.textContent = "Saving...";
    try {
      const created = await createPerson(payload);
      allPeople = [...allPeople, created].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
      renderActiveList();
      peopleForm.reset();
      personStatus.textContent = "Person added.";
      closePeopleModal();
    } catch (error) {
      personStatus.textContent = error?.message
        ? `Save failed: ${error.message}`
        : "Save failed.";
    }
  });
}

const updateAuthModalMessage = (message) => {
  if (authModalMessage) {
    authModalMessage.textContent = message || "";
  }
};

const closeUserMenu = () => {
  userMenuDropdown?.classList.remove("open");
  userMenuButton?.setAttribute("aria-expanded", "false");
};

const toggleUserMenu = () => {
  const isOpen = userMenuDropdown?.classList.contains("open");
  closeCreateMenu();
  closeAllRecipeMenus();
  if (isOpen) {
    closeUserMenu();
    return;
  }
  userMenuDropdown?.classList.add("open");
  userMenuButton?.setAttribute("aria-expanded", "true");
};

const closeAuthModal = (clearPassword = true) => {
  if (!authModal) return;
  authModal.classList.remove("open");
  authModal.setAttribute("aria-hidden", "true");
  if (clearPassword && authPasswordInput) {
    authPasswordInput.value = "";
  }
  updateAuthModalMessage("");
};

const setAuthModalMode = (mode) => {
  authModalMode = mode === "signup" ? "signup" : "signin";
  const isSignIn = authModalMode === "signin";
  if (authModalTitle) {
    authModalTitle.textContent = isSignIn ? "Sign in" : "Create account";
  }
  if (authSubmitButton) {
    authSubmitButton.textContent = isSignIn ? "Sign in" : "Create account";
  }
  if (authTabSignIn) {
    authTabSignIn.classList.toggle("active", isSignIn);
    authTabSignIn.setAttribute("aria-selected", isSignIn ? "true" : "false");
  }
  if (authTabSignUp) {
    authTabSignUp.classList.toggle("active", !isSignIn);
    authTabSignUp.setAttribute("aria-selected", !isSignIn ? "true" : "false");
  }
};

const openAuthModal = (mode) => {
  if (!authModal) return;
  closeUserMenu();
  closeCreateMenu();
  setAuthModalMode(mode);
  loadAuthEmail();
  updateAuthModalMessage("");
  if (!sb) {
    updateAuthModalMessage(
      isSupabaseConfigured()
        ? "Supabase client not ready. Refresh the page."
        : "Configure url and anonKey (see supabase-config.example.js)."
    );
  }
  authModal.classList.add("open");
  authModal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => authEmailInput?.focus());
};

const updateAuthUi = (session, authEvent) => {
  const email = session?.user?.email || "";
  closeUserMenu();
  if (session) {
    closeAuthModal();
    if (authHeaderGuest) authHeaderGuest.hidden = true;
    if (authHeaderUser) authHeaderUser.hidden = false;
    if (userMenuEmail) userMenuEmail.textContent = email;
    const initial = email.trim().charAt(0).toUpperCase() || "?";
    if (userAvatarInitial) userAvatarInitial.textContent = initial;
  } else if (authEvent === "INITIAL_SESSION" || authEvent === "SIGNED_OUT") {
    if (authHeaderGuest) authHeaderGuest.hidden = false;
    if (authHeaderUser) authHeaderUser.hidden = true;
  }
};

const bootstrapDataAfterAuth = () => {
  if (!supabaseConfig?.url) {
    return;
  }
  if (!sessionAccessToken) {
    allRecipes = [];
    allIngredients = [];
    allInventoryItems = [];
    allEquipment = [];
    allShoppingItems = [];
    allPeople = [];
    currentMealPlan = null;
    renderActiveList();
    return;
  }
  loadRecipes();
  loadIngredients();
  loadInventoryItems();
  loadEquipment();
  loadShoppingItems();
  loadPeople();
  loadCurrentWeekMealPlan();
};

const saveAuthEmail = () => {
  try {
    const email = authEmailInput?.value?.trim();
    if (email) localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, email);
  } catch {
    /* ignore quota / private mode */
  }
};

const loadAuthEmail = () => {
  try {
    const email = localStorage.getItem(AUTH_EMAIL_STORAGE_KEY);
    if (email && authEmailInput) authEmailInput.value = email;
  } catch {
    /* ignore */
  }
};

const attachAuthUiListeners = () => {
  loadAuthEmail();
  authEmailInput?.addEventListener("change", saveAuthEmail);

  authOpenSignInBtn?.addEventListener("click", () => openAuthModal("signin"));
  authOpenSignUpBtn?.addEventListener("click", () => openAuthModal("signup"));

  authTabSignIn?.addEventListener("click", () => {
    setAuthModalMode("signin");
    updateAuthModalMessage("");
  });
  authTabSignUp?.addEventListener("click", () => {
    setAuthModalMode("signup");
    updateAuthModalMessage("");
  });

  authModal?.querySelectorAll("[data-close-auth]").forEach((el) => {
    el.addEventListener("click", () => closeAuthModal());
  });

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!sb) {
      updateAuthModalMessage(
        isSupabaseConfigured()
          ? "Supabase client not ready. Refresh the page."
          : "Configure url and anonKey (see supabase-config.example.js)."
      );
      return;
    }
    const email = authEmailInput?.value?.trim() || "";
    const password = authPasswordInput?.value || "";
    if (!email || !password) {
      updateAuthModalMessage("Enter email and password.");
      return;
    }
    if (authModalMode === "signin") {
      updateAuthModalMessage("Signing in…");
      try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          updateAuthModalMessage(error.message || "Sign-in failed.");
          return;
        }
        saveAuthEmail();
        if (authPasswordInput) authPasswordInput.value = "";
      } catch (err) {
        console.error("signInWithPassword", err);
        updateAuthModalMessage(
          err?.message ? `Sign-in failed: ${err.message}` : "Sign-in failed."
        );
      }
      return;
    }

    updateAuthModalMessage("Creating account…");
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        updateAuthModalMessage(error.message || "Sign-up failed.");
        return;
      }
      saveAuthEmail();
      if (authPasswordInput) authPasswordInput.value = "";
      if (data?.session) {
        updateAuthModalMessage("Signed in — your account is ready.");
      } else {
        updateAuthModalMessage(
          "Account created — open the confirmation link in your email, then sign in."
        );
      }
    } catch (err) {
      console.error("signUp", err);
      updateAuthModalMessage(
        err?.message ? `Sign-up failed: ${err.message}` : "Sign-up failed."
      );
    }
  });

  userMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleUserMenu();
  });

  userMenuSignOut?.addEventListener("click", async () => {
    closeUserMenu();
    if (!sb) return;
    await sb.auth.signOut();
  });

  document.addEventListener("click", (event) => {
    if (
      userMenuDropdown &&
      userMenuButton &&
      !userMenuDropdown.contains(event.target) &&
      !userMenuButton.contains(event.target)
    ) {
      closeUserMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (authModal?.classList.contains("open")) {
      closeAuthModal();
    }
    closeUserMenu();
  });
};

const initSupabaseClient = () => {
  if (!isSupabaseConfigured()) {
    return;
  }
  const globalSb = window.supabase;
  if (!globalSb?.createClient) {
    return;
  }
  sb = globalSb.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });

  const applySession = (session, authEvent) => {
    sessionAccessToken = session?.access_token ?? null;
    updateAuthUi(session, authEvent);
    bootstrapDataAfterAuth();
  };

  sb.auth.getSession().then(({ data: { session } }) => {
    applySession(session, "INITIAL_SESSION");
  });

  sb.auth.onAuthStateChange((event, session) => {
    applySession(session, event);
  });
};

const updateSupabaseConfigBanner = () => {
  const banner = document.getElementById("supabaseConfigBanner");
  if (!banner) return;
  const ready = isSupabaseConfigured() && sb !== null;
  banner.classList.toggle("is-hidden", ready);
};

attachAuthUiListeners();
initSupabaseClient();
updateSupabaseConfigBanner();
const urlState = getInitialUrlState();
setActiveView(urlState?.view || "plan");

modalRecipeMenuButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleRecipeMenu(modalRecipeMenuButton, modalRecipeMenuDropdown);
});

modalRecipeMenuDropdown?.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  if (!action) return;
  event.stopPropagation();
  closeAllRecipeMenus();
  handleRecipeAction(action, activeRecipe);
});
