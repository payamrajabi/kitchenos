# KitchenOS (iOS)

Native SwiftUI client sharing the same Supabase project as [app/recipes-ui/](../app/recipes-ui/).

## Setup

1. In Supabase: enable **Email** auth, run [app/database/supabase_setup.sql](../app/database/supabase_setup.sql) if needed, then [app/database/supabase_migration_kitchenos_v2.sql](../app/database/supabase_migration_kitchenos_v2.sql).
2. **Google sign-in:** use the same Google **Web** OAuth client as the Supabase dashboard (redirect `https://<project-ref>.supabase.co/auth/v1/callback`). In Supabase **Authentication → URL configuration → Redirect URLs**, add `com.kitchenos.app://auth-callback` (matches `KitchenOSConfig.oauthRedirectURL` and the URL scheme in [KitchenOS/Info.plist](KitchenOS/Info.plist)).
3. Edit [KitchenOS/KitchenOSConfig.swift](KitchenOS/KitchenOSConfig.swift) with your project URL and anon key (see [KitchenOSConfig.example.swift](KitchenOS/KitchenOSConfig.example.swift)).
4. Generate the Xcode project (if `KitchenOS.xcodeproj` is missing):

   ```bash
   brew install xcodegen
   cd ios && xcodegen generate
   ```

5. Open `ios/KitchenOS.xcodeproj` in Xcode, select an iOS Simulator or device, and run.

The Xcode project pulls **supabase-swift** via Swift Package Manager (declared in [project.yml](project.yml)).

## Features (MVP)

- Email/password and Google sign-in (same Supabase project as the web app).
- Read-only lists for recipes and ingredients; recipe detail with image, macros, and text fields.
- Uses the same RLS rules as the browser: only rows owned by your user are visible after migration v2.
