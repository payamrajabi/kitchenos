import SwiftUI

struct RecipeDetailView: View {
  let recipe: RecipeRow

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let urlString = recipe.imageUrl, let url = URL(string: urlString) {
          AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
              image
                .resizable()
                .scaledToFill()
            default:
              Color.gray.opacity(0.15)
                .overlay { ProgressView() }
            }
          }
          .frame(maxHeight: 220)
          .clipShape(RoundedRectangle(cornerRadius: 12))
        }

        Text(recipe.name)
          .font(.title2.bold())

        HStack(spacing: 12) {
          if let s = recipe.servings {
            Label("\(s) servings", systemImage: "person.2")
              .font(.subheadline)
          }
          if let c = recipe.calories {
            Label("\(c) cal", systemImage: "flame")
              .font(.subheadline)
          }
        }
        .foregroundStyle(.secondary)

        if let ing = recipe.ingredients, !ing.isEmpty {
          section(title: "Ingredients", text: ing)
        }
        if let ins = recipe.instructions, !ins.isEmpty {
          section(title: "Instructions", text: ins)
        }
        if let notes = recipe.notes, !notes.isEmpty {
          section(title: "Notes", text: notes)
        }
        if let src = recipe.sourceUrl, let url = URL(string: src) {
          Link("Open source", destination: url)
            .font(.subheadline)
        }
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .navigationBarTitleDisplayMode(.inline)
  }

  private func section(title: String, text: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.headline)
      Text(text)
        .font(.body)
        .foregroundStyle(.primary)
    }
  }
}
