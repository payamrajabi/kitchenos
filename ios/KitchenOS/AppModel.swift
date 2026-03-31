import Foundation
import Supabase

@MainActor
final class AppModel: ObservableObject {
  let client: SupabaseClient

  @Published var session: Session?
  @Published var recipes: [RecipeRow] = []
  @Published var ingredients: [IngredientRow] = []
  @Published var loadError: String?

  init() {
    client = SupabaseClient(
      supabaseURL: KitchenOSConfig.supabaseURL,
      supabaseKey: KitchenOSConfig.anonKey,
      options: SupabaseClientOptions(
        auth: .init(redirectToURL: KitchenOSConfig.oauthRedirectURL)
      )
    )
    Task { @MainActor in
      await observeAuthState()
    }
  }

  func handleOpenURL(_ url: URL) {
    client.handle(url)
  }

  private func observeAuthState() async {
    for await (_, newSession) in client.auth.authStateChanges {
      session = newSession
      if newSession == nil {
        recipes = []
        ingredients = []
      }
    }
  }

  func refreshSession() async {
    session = client.auth.currentSession
  }

  func signIn(email: String, password: String) async throws {
    session = try await client.auth.signIn(email: email, password: password)
  }

  func signUp(email: String, password: String) async throws {
    _ = try await client.auth.signUp(email: email, password: password)
    await refreshSession()
  }

  func signInWithGoogle() async throws {
    session = try await client.auth.signInWithOAuth(provider: .google) { _ in }
  }

  func signOut() async throws {
    try await client.auth.signOut()
    session = nil
    recipes = []
    ingredients = []
  }

  func loadRecipes() async {
    loadError = nil
    do {
      let rows: [RecipeRow] =
        try await client
        .from("recipes")
        .select()
        .order("name", ascending: true)
        .execute()
        .value
      recipes = rows
    } catch {
      loadError = error.localizedDescription
      recipes = []
    }
  }

  func loadIngredients() async {
    loadError = nil
    do {
      let rows: [IngredientRow] =
        try await client
        .from("ingredients")
        .select()
        .order("name", ascending: true)
        .execute()
        .value
      ingredients = rows
    } catch {
      loadError = error.localizedDescription
      ingredients = []
    }
  }

  func publicImageURL(path: String) -> URL? {
    var c = URLComponents(
      url: KitchenOSConfig.supabaseURL
        .appendingPathComponent("storage/v1/object/public")
        .appendingPathComponent(KitchenOSConfig.recipeImagesBucket)
        .appendingPathComponent(path),
      resolvingAgainstBaseURL: false
    )
    return c?.url
  }
}
