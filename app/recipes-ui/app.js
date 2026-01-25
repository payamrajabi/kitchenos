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
const importForm = document.getElementById("importForm");
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
const openaiKeyInput = document.getElementById("openaiKey");
const openaiModelInput = document.getElementById("openaiModel");
const openaiRememberInput = document.getElementById("openaiRemember");
const estimateButton = document.getElementById("estimateButton");
const estimateStatus = document.getElementById("estimateStatus");
const estimateNotes = document.getElementById("estimateNotes");
const manualStatus = document.getElementById("manualStatus");
const importUrlInput = document.getElementById("importUrl");
const importStatus = document.getElementById("importStatus");
const tabButtons = document.querySelectorAll(".tab-button");
const panels = document.querySelectorAll(".adder-panel");
const createOptions = document.querySelectorAll("[data-create]");
const viewSubtitle = document.getElementById("viewSubtitle");
const viewButtons = document.querySelectorAll(".page-tab-button");
const ingredientModal = document.getElementById("ingredientModal");
const ingredientForm = document.getElementById("ingredientForm");
const ingredientNameInput = document.getElementById("ingredientName");
const ingredientStatus = document.getElementById("ingredientStatus");
const modalRecipeMenu = document.getElementById("modalRecipeMenu");
const modalRecipeMenuButton = document.getElementById("modalRecipeMenuButton");
const modalRecipeMenuDropdown = document.getElementById("modalRecipeMenuDropdown");

let allRecipes = [];
let allIngredients = [];
let activeRecipe = null;
let activeView = "recipes";
let editingRecipeId = null;

const OPENAI_KEY_STORAGE = "kitchenos_openai_key";
const OPENAI_MODEL_STORAGE = "kitchenos_openai_model";

const supabaseConfig = window.SUPABASE_CONFIG || null;
const openAiConfig = window.OPENAI_CONFIG || {};
const supabaseHeaders = supabaseConfig
  ? {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
    }
  : {};

const formatNumber = (value, suffix = "") => {
  if (value === null || value === undefined) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return `${number}${suffix}`;
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
    .map((entry) => entry.replace(/^\d+\.\s*/, ""))
    .map(normalizeIngredientName)
    .filter(Boolean);
};

const uniqueIngredients = (items) => {
  const seen = new Set();
  const output = [];
  items.forEach((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
};

const setEstimateStatus = (message) => {
  estimateStatus.textContent = message || "";
};

const showEstimateNotes = (text) => {
  if (!text) {
    estimateNotes.textContent = "";
    estimateNotes.classList.remove("is-visible");
    return;
  }
  estimateNotes.textContent = text;
  estimateNotes.classList.add("is-visible");
};

const setNumericInput = (input, value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return;
  }
  input.value = String(Math.round(Number(value)));
};

const initOpenAiSettings = () => {
  const savedKey = localStorage.getItem(OPENAI_KEY_STORAGE);
  const savedModel = localStorage.getItem(OPENAI_MODEL_STORAGE);
  const configKey = (openAiConfig.apiKey || "").trim();
  const configModel = (openAiConfig.model || "").trim();

  if (configKey) {
    openaiKeyInput.value = configKey;
    openaiKeyInput.disabled = true;
    const keyLabel = openaiKeyInput.closest("label");
    if (keyLabel) keyLabel.classList.add("is-hidden");
    const rememberLabel = openaiRememberInput.closest("label");
    if (rememberLabel) rememberLabel.classList.add("is-hidden");
  } else if (savedKey) {
    openaiKeyInput.value = savedKey;
    openaiRememberInput.checked = true;
  }

  if (savedModel) {
    openaiModelInput.value = savedModel;
  } else if (configModel) {
    openaiModelInput.value = configModel;
  }
};

const persistOpenAiSettings = () => {
  const modelValue = openaiModelInput.value.trim();
  const configKey = (openAiConfig.apiKey || "").trim();
  if (!configKey) {
    if (openaiRememberInput.checked) {
      const keyValue = openaiKeyInput.value.trim();
      if (keyValue) {
        localStorage.setItem(OPENAI_KEY_STORAGE, keyValue);
      }
    } else {
      localStorage.removeItem(OPENAI_KEY_STORAGE);
    }
  }
  if (modelValue) {
    localStorage.setItem(OPENAI_MODEL_STORAGE, modelValue);
  }
};

const buildNutritionPrompt = (data) => ({
  role: "user",
  content: JSON.stringify(
    {
      recipe_name: data.name || null,
      servings: data.servings || null,
      ingredients: data.ingredients,
      instructions: data.instructions || null,
    },
    null,
    2
  ),
});

const extractJson = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw error;
    }
    return JSON.parse(match[0]);
  }
};

const requestNutritionEstimate = async ({ apiKey, model, payload }) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You estimate nutrition from recipe ingredients. Return JSON only with keys: servings, total, ingredients, assumptions. servings is a number. total is an object with calories, protein_grams, fat_grams, carbs_grams. ingredients is an array of objects with name, amount, calories, protein_grams, fat_grams, carbs_grams. assumptions is a short string. Use reasonable defaults for missing amounts. Be explicit and conservative.",
        },
        buildNutritionPrompt(payload),
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Nutrition estimate failed.");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Nutrition estimate missing response content.");
  }
  return extractJson(content);
};

const formatNutritionNotes = (estimate) => {
  if (!estimate) return "";
  const lines = ["Nutrition estimate (LLM, not verified)"];
  if (estimate.assumptions) {
    lines.push(`Assumptions: ${estimate.assumptions}`);
  }
  if (Array.isArray(estimate.ingredients) && estimate.ingredients.length) {
    lines.push("Per-ingredient breakdown:");
    estimate.ingredients.forEach((item) => {
      if (!item || !item.name) return;
      const calories = item.calories ? `${Math.round(item.calories)} cal` : "cal ?";
      const protein = item.protein_grams ? `${Math.round(item.protein_grams)}g P` : "P ?";
      const fat = item.fat_grams ? `${Math.round(item.fat_grams)}g F` : "F ?";
      const carbs = item.carbs_grams ? `${Math.round(item.carbs_grams)}g C` : "C ?";
      const amount = item.amount ? ` (${item.amount})` : "";
      lines.push(`- ${item.name}${amount}: ${calories}, ${protein}, ${fat}, ${carbs}`);
    });
  }
  return lines.join("\n");
};

const getPrimaryImageUrl = (recipe) => {
  if (recipe.image_url) return recipe.image_url;
  if (Array.isArray(recipe.image_urls) && recipe.image_urls.length) {
    return recipe.image_urls[0];
  }
  return null;
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
};

const setActiveView = (viewName) => {
  activeView = viewName;
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  viewSubtitle.textContent = viewName === "ingredients" ? "Ingredients" : "Recipes";
  searchInput.placeholder =
    viewName === "ingredients" ? "Search ingredients..." : "Search recipes...";
  renderActiveList();
};

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

const openAddModal = (tabName = "manual") => {
  setActiveTab(tabName);
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
    openAddModal(option.dataset.create);
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

let isEstimating = false;
let estimateTimer = null;
let lastEstimateSignature = "";

const buildEstimatePayload = () => ({
  name: recipeNameInput.value.trim(),
  servings: toNumberOrNull(servingsInput.value),
  ingredients: ingredientsInput.value.trim(),
  instructions: toOptionalString(instructionsInput.value),
});

const getOpenAiCredentials = () => {
  const configKey = (openAiConfig.apiKey || "").trim();
  const configModel = (openAiConfig.model || "").trim();
  return {
    apiKey: configKey || openaiKeyInput.value.trim(),
    model: openaiModelInput.value.trim() || configModel || "gpt-5.2",
  };
};

const runEstimate = async ({ silent = false, force = false } = {}) => {
  setEstimateStatus("");
  showEstimateNotes("");

  const payload = buildEstimatePayload();
  if (!payload.ingredients) {
    if (!silent) {
      setEstimateStatus("Add ingredients first.");
    }
    return;
  }

  const { apiKey, model } = getOpenAiCredentials();
  if (!apiKey) {
    if (!silent) {
      setEstimateStatus("Add an OpenAI API key.");
    }
    return;
  }

  const signature = JSON.stringify(payload);
  if (!force && signature === lastEstimateSignature) {
    return;
  }
  if (isEstimating) {
    return;
  }

  setEstimateStatus("Estimating...");
  isEstimating = true;
  try {
    const estimate = await requestNutritionEstimate({
      apiKey,
      model,
      payload,
    });

    lastEstimateSignature = signature;
    persistOpenAiSettings();

    if (estimate?.servings && !servingsInput.value.trim()) {
      setNumericInput(servingsInput, estimate.servings);
    }
    if (estimate?.total) {
      setNumericInput(caloriesInput, estimate.total.calories);
      setNumericInput(proteinGramsInput, estimate.total.protein_grams);
      setNumericInput(fatGramsInput, estimate.total.fat_grams);
      setNumericInput(carbsGramsInput, estimate.total.carbs_grams);
    }

    const formattedNotes = formatNutritionNotes(estimate);
    if (formattedNotes) {
      const currentNotes = notesInput.value.trim();
      notesInput.value = currentNotes
        ? `${currentNotes}\n\n${formattedNotes}`
        : formattedNotes;
      showEstimateNotes(formattedNotes);
    }

    setEstimateStatus("Estimate complete.");
  } catch (error) {
    setEstimateStatus(
      error?.message ? `Estimate failed: ${error.message}` : "Estimate failed."
    );
  } finally {
    isEstimating = false;
  }
};

const scheduleEstimate = () => {
  if (estimateTimer) {
    clearTimeout(estimateTimer);
  }
  estimateTimer = setTimeout(() => {
    runEstimate({ silent: true });
  }, 900);
};

estimateButton.addEventListener("click", () => {
  runEstimate({ force: true });
});

ingredientsInput.addEventListener("input", scheduleEstimate);
instructionsInput.addEventListener("input", scheduleEstimate);
servingsInput.addEventListener("input", scheduleEstimate);

const renderCards = (recipes) => {
  grid.innerHTML = "";
  if (!recipes.length) {
    grid.innerHTML = "<p>No recipes found.</p>";
    return;
  }

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
        ...
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

const renderIngredientCards = (ingredients) => {
  grid.innerHTML = "";
  if (!ingredients.length) {
    grid.innerHTML = "<p>No ingredients found.</p>";
    return;
  }

  ingredients.forEach((ingredient) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-image">Ingredient</div>
      <div class="card-content">
        <h4 class="card-title">${ingredient.name}</h4>
      </div>
    `;
    grid.appendChild(card);
  });
};

const renderActiveList = () => {
  const term = searchInput.value.trim().toLowerCase();
  if (activeView === "ingredients") {
    const filtered = allIngredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(term)
    );
    renderIngredientCards(filtered);
    return;
  }
  const filtered = allRecipes.filter((recipe) =>
    recipe.name.toLowerCase().includes(term)
  );
  renderCards(filtered);
};

const openModal = (recipe) => {
  activeRecipe = recipe;
  closeAllRecipeMenus();
  modalTitle.textContent = recipe.name;
  modalIngredients.textContent = recipe.ingredients || "Not provided";
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
};

const closeModal = () => {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
};

modal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close]")) {
    closeModal();
  }
});

addModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-add]")) {
    closeAddModal();
  }
});

ingredientModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-ingredient]")) {
    closeIngredientModal();
  }
});

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
    } else {
      closeModal();
    }
  }
});

searchInput.addEventListener("input", (event) => {
  renderActiveList();
});

const loadRecipes = async () => {
  try {
    if (!supabaseConfig) {
      throw new Error("Supabase config missing");
    }

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/recipes?select=*&order=name.asc`,
      {
        headers: {
          ...supabaseHeaders,
          Accept: "application/json",
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

    const response = await fetch(
      `${supabaseConfig.url}/rest/v1/ingredients?select=*&order=name.asc`,
      {
        headers: {
          ...supabaseHeaders,
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to load ingredients from Supabase");
    }
    allIngredients = await response.json();
    renderActiveList();
  } catch (error) {
    if (activeView === "ingredients") {
      grid.innerHTML =
        "<p>Unable to load ingredients. Check Supabase config and your connection.</p>";
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

const resetManualFormMode = () => {
  editingRecipeId = null;
  addModalTitle.textContent = "Add a recipe";
  manualSubmitButton.textContent = "Save recipe";
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
        ...supabaseHeaders,
        "Content-Type": "application/json",
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
        ...supabaseHeaders,
        "Content-Type": "application/json",
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

const deleteRecipe = async (recipeId) => {
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipes?id=eq.${recipeId}`,
    {
      method: "DELETE",
      headers: {
        ...supabaseHeaders,
        "Content-Type": "application/json",
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
      ...supabaseHeaders,
      "Content-Type": "application/json",
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

const openEditModal = (recipe) => {
  if (!recipe) return;
  editingRecipeId = recipe.id;
  setManualFormModeEdit();
  setActiveTab("manual");
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
  ingredientsInput.value = recipe.ingredients || "";
  instructionsInput.value = recipe.instructions || "";
  notesInput.value = recipe.notes || "";
  openAddModal("manual");
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
    openEditModal(recipe);
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
      await syncIngredientsForRecipe(created.id, created.ingredients || "");
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
    `${supabaseConfig.url}/rest/v1/ingredients?on_conflict=name`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        "Content-Type": "application/json",
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
        ...supabaseHeaders,
        Accept: "application/json",
      },
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to load ingredients");
  }
  return response.json();
};

const linkRecipeIngredients = async (recipeId, ingredientIds) => {
  if (!ingredientIds.length) return;
  const payload = ingredientIds.map((ingredientId) => ({
    recipe_id: recipeId,
    ingredient_id: ingredientId,
  }));
  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/recipe_ingredients?on_conflict=recipe_id,ingredient_id`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        "Content-Type": "application/json",
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

const syncIngredientsForRecipe = async (recipeId, ingredientText) => {
  const names = uniqueIngredients(splitIngredientInput(ingredientText));
  if (!names.length) return;
  await upsertIngredients(names);
  const ingredients = await fetchIngredientIdsByName(names);
  await linkRecipeIngredients(
    recipeId,
    ingredients.map((item) => item.id)
  );
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
      ...supabaseHeaders,
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
    const payload = buildRecipePayloadFromForm();

    if (editingRecipeId) {
      const updated = await updateRecipe(editingRecipeId, payload);
      await syncIngredientsForRecipe(updated.id, ingredientsInput.value);
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
      imageUrlInput.dataset.imageUrls = "";
      manualStatus.textContent = "Recipe updated.";
      closeAddModal();
      resetManualFormMode();
      return;
    }

    const created = await createRecipe(payload);
    await syncIngredientsForRecipe(created.id, ingredientsInput.value);
    allRecipes = [...allRecipes, created].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    renderActiveList();
    manualForm.reset();
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
    await upsertIngredients([name]);
    await loadIngredients();
    ingredientStatus.textContent = "Ingredient added.";
    closeIngredientModal();
  } catch (error) {
    ingredientStatus.textContent = error?.message
      ? `Save failed: ${error.message}`
      : "Save failed.";
  }
});

const fetchReadableText = async (url) => {
  let normalized = url.trim();
  if (!/^[a-z]+:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error("Unable to read that URL.");
  }

  const readableUrl = `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  const response = await fetch(readableUrl);
  if (!response.ok) {
    if (response.status === 451) {
      throw new Error(
        "That site blocks the readable-text proxy. Try manual entry or another source."
      );
    }
    throw new Error("Unable to read that URL.");
  }
  return response.text();
};

const extractSection = (lines, labels) => {
  const labelRegex = new RegExp(`^#{1,6}\\s*(${labels.join("|")})\\b`, "i");
  const headingRegex = /^#{1,6}\s+/;
  const startIndex = lines.findIndex((line) => labelRegex.test(line.trim()));
  if (startIndex === -1) return "";

  const sectionLines = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (headingRegex.test(line.trim())) break;
    if (!line.trim() && sectionLines.length === 0) continue;
    sectionLines.push(line.trim());
  }
  return sectionLines.join("\n").trim();
};

const extractTitle = (lines) => {
  const heading = lines.find((line) => /^#\s+/.test(line.trim()));
  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }
  const altHeading = lines.find((line) => /^##\s+/.test(line.trim()));
  if (altHeading) {
    return altHeading.replace(/^##\s+/, "").trim();
  }
  const firstLine = lines.find((line) => line.trim());
  return firstLine ? firstLine.trim() : "";
};

const buildTitleKeywords = (title) => {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "or",
    "the",
    "of",
    "for",
    "with",
    "to",
    "from",
    "in",
    "on",
    "at",
    "by",
    "recipe",
  ]);
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length > 3 && !stopwords.has(word));
};

const normalizeUrl = (candidate, baseUrl) => {
  if (!candidate) return "";
  const trimmed = candidate.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return new URL(trimmed, baseUrl).toString();
  } catch (error) {
    return "";
  }
};

const extractImageUrls = (text, baseUrl, title) => {
  const urls = new Set();
  const addUrl = (candidate) => {
    const normalized = normalizeUrl(candidate, baseUrl);
    if (normalized) urls.add(normalized);
  };

  const markdownRegex = /!\[[^\]]*]\(([^)]+)\)/g;
  let match = markdownRegex.exec(text);
  while (match) {
    addUrl(match[1]);
    match = markdownRegex.exec(text);
  }

  const imgRegex = /<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
  match = imgRegex.exec(text);
  while (match) {
    addUrl(match[1]);
    match = imgRegex.exec(text);
  }

  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  match = metaRegex.exec(text);
  while (match) {
    addUrl(match[1]);
    match = metaRegex.exec(text);
  }

  const blocked = [
    "logo",
    "icon",
    "avatar",
    "profile",
    "banner",
    "header",
    "footer",
    "sprite",
    "social",
    "facebook",
    "instagram",
    "pinterest",
    "twitter",
    "tiktok",
    "favicon",
    "badge",
    "newsletter",
    "promo",
    "ads",
    "doubleclick",
  ];
  const foodKeywords = [
    "food",
    "recipe",
    "dish",
    "meal",
    "noodle",
    "noodles",
    "pasta",
    "salad",
    "soup",
    "curry",
    "bowl",
    "dessert",
    "cake",
    "cookie",
    "bread",
    "pizza",
    "taco",
    "burger",
    "sandwich",
    "chicken",
    "beef",
    "pork",
    "fish",
    "seafood",
    "tofu",
    "vegan",
    "almond",
    "hazelnut",
  ];
  const titleKeywords = buildTitleKeywords(title);

  const scoreUrl = (url) => {
    const lower = url.toLowerCase();
    let score = 0;
    if (blocked.some((word) => lower.includes(word))) score -= 4;
    if (foodKeywords.some((word) => lower.includes(word))) score += 2;
    if (titleKeywords.some((word) => lower.includes(word))) score += 2;
    if (lower.includes("wp-content") || lower.includes("/uploads/")) score += 1;
    if (lower.includes("/images/") || lower.includes("image")) score += 1;
    return score;
  };

  const isLikelyImage = (url) => {
    const lower = url.toLowerCase();
    if (blocked.some((word) => lower.includes(word))) return false;
    if (/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(lower)) return true;
    return /(?:format=|image=|img=)/i.test(lower);
  };

  const scored = Array.from(urls)
    .filter((url) => isLikelyImage(url))
    .map((url) => ({ url, score: scoreUrl(url) }))
    .sort((a, b) => b.score - a.score);

  const filtered = scored.filter((item) => item.score >= 1).map((item) => item.url);
  if (filtered.length) return filtered;
  return scored.map((item) => item.url);
};

const extractRecipeFromUrl = async (url) => {
  const text = await fetchReadableText(url);
  const lines = text.split("\n");
  const title = extractTitle(lines);
  const ingredients = extractSection(lines, ["ingredients", "ingredient"]);
  const instructions = extractSection(lines, [
    "directions",
    "instructions",
    "method",
    "steps",
  ]);
  const imageUrls = extractImageUrls(text, url, title);

  return {
    title,
    ingredients,
    instructions,
    imageUrls,
  };
};

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  importStatus.textContent = "Importing...";
  try {
    const url = importUrlInput.value.trim();
    const data = await extractRecipeFromUrl(url);
    const primaryImage = data.imageUrls.length ? data.imageUrls[0] : "";

    recipeNameInput.value = data.title || recipeNameInput.value;
    ingredientsInput.value = data.ingredients || ingredientsInput.value;
    instructionsInput.value = data.instructions || instructionsInput.value;
    imageUrlInput.value = primaryImage || imageUrlInput.value;
    sourceUrlInput.value = url;
    imageUrlInput.dataset.imageUrls = JSON.stringify(data.imageUrls);

    setActiveTab("manual");
    manualStatus.textContent = data.imageUrls.length
      ? `Imported. Found ${data.imageUrls.length} food image(s). Review and save.`
      : "Imported. Review and save.";
    importStatus.textContent = "Imported.";
  } catch (error) {
    importStatus.textContent = error?.message
      ? `Import failed: ${error.message}`
      : "Import failed.";
  }
});

initOpenAiSettings();
setActiveView("recipes");
loadRecipes();
loadIngredients();

modalRecipeMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleRecipeMenu(modalRecipeMenuButton, modalRecipeMenuDropdown);
});

modalRecipeMenuDropdown.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  if (!action) return;
  event.stopPropagation();
  closeAllRecipeMenus();
  handleRecipeAction(action, activeRecipe);
});
