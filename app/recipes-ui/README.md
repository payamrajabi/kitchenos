# Recipes UI

This is a lightweight browser UI for viewing recipes from the SQLite database.

## 1) Configure Supabase

The UI reads directly from Supabase. Edit `app/recipes-ui/supabase-config.js`
if you change project keys or bucket names.

## 2) Run a local server

From the repo root:

```
python3 -m http.server 8000
```

## 3) Open in your browser

```
http://localhost:8000/app/recipes-ui/
```
