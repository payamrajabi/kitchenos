import Foundation

/// Copy to `KitchenOSConfig.swift` and fill in your project values (do not commit secrets).
enum KitchenOSConfig {
  static let supabaseURL = URL(string: "https://ggwqnakrqttydigdsfko.supabase.co")!
  static let anonKey = "YOUR_ANON_KEY"
  static let recipeImagesBucket = "recipe-images"

  /// Must match a URL in Supabase Auth → URL configuration → Redirect URLs (e.g. `com.kitchenos.app://auth-callback`).
  static let oauthRedirectURL = URL(string: "com.kitchenos.app://auth-callback")!
}
