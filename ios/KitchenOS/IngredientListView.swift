import SwiftUI

struct IngredientListView: View {
  @EnvironmentObject private var appModel: AppModel

  var body: some View {
    NavigationStack {
      List(appModel.ingredients) { item in
        VStack(alignment: .leading, spacing: 4) {
          Text(item.name)
            .font(.headline)
          HStack {
            if let cat = item.category, !cat.isEmpty {
              Text(cat)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if let stock = item.currentStock, !stock.isEmpty {
              Text("Stock: \(stock)")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
        .padding(.vertical, 4)
      }
      .navigationTitle("Ingredients")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            Task { await appModel.loadIngredients() }
          } label: {
            Image(systemName: "arrow.clockwise")
          }
        }
      }
    }
  }
}
