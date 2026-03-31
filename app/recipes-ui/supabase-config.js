// Defaults only — add real credentials in supabase-config.local.js (gitignored).
// See supabase-config.local.example.js and README. Email auth: Supabase → Authentication → Providers.
window.SUPABASE_CONFIG = {
  url: "",
  anonKey: "",
  bucket: "recipe-images",
};

// Optional: OpenAI model passed to the Edge Function (nutrition + meal plan).
window.OPENAI_CONFIG = {
  model: "gpt-4o-mini",
};
