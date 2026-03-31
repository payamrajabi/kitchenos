import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var appModel: AppModel

  var body: some View {
    Group {
      if appModel.session == nil {
        AuthGateView()
      } else {
        TabView {
          RecipeListView()
            .tabItem { Label("Recipes", systemImage: "book.closed") }
          IngredientListView()
            .tabItem { Label("Inventory", systemImage: "refrigerator") }
        }
      }
    }
    .task(id: appModel.session?.user.id) {
      guard appModel.session != nil else { return }
      await appModel.loadRecipes()
      await appModel.loadIngredients()
    }
  }
}

#Preview {
  ContentView()
    .environmentObject(AppModel())
}
