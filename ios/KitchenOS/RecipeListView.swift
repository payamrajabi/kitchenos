import SwiftUI

struct RecipeListView: View {
  @EnvironmentObject private var appModel: AppModel
  @State private var selection: RecipeRow?

  var body: some View {
    NavigationSplitView {
      List(appModel.recipes, selection: $selection) { recipe in
        NavigationLink(value: recipe) {
          VStack(alignment: .leading, spacing: 4) {
            Text(recipe.name)
              .font(.headline)
            if let cal = recipe.calories {
              Text("\(cal) cal")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
      }
      .navigationTitle("Recipes")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Sign out") {
            Task {
              try? await appModel.signOut()
            }
          }
        }
        ToolbarItem(placement: .topBarLeading) {
          Button {
            Task { await appModel.loadRecipes() }
          } label: {
            Image(systemName: "arrow.clockwise")
          }
        }
      }
    } detail: {
      if let recipe = selection {
        RecipeDetailView(recipe: recipe)
      } else {
        ContentUnavailableView("Select a recipe", systemImage: "book.closed")
      }
    }
    .overlay {
      if let err = appModel.loadError, appModel.recipes.isEmpty {
        ContentUnavailableView(
          "Could not load",
          systemImage: "exclamationmark.triangle",
          description: Text(err)
        )
      }
    }
  }
}
