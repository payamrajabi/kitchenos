import Foundation

struct RecipeRow: Codable, Identifiable, Hashable {
  let id: Int64
  var name: String
  var imageUrl: String?
  var notes: String?
  var ingredients: String?
  var instructions: String?
  var sourceUrl: String?
  var servings: Int?
  var calories: Int?
  var proteinGrams: Int?
  var fatGrams: Int?
  var carbsGrams: Int?

  enum CodingKeys: String, CodingKey {
    case id
    case name
    case imageUrl = "image_url"
    case notes
    case ingredients
    case instructions
    case sourceUrl = "source_url"
    case servings
    case calories
    case proteinGrams = "protein_grams"
    case fatGrams = "fat_grams"
    case carbsGrams = "carbs_grams"
  }
}

struct IngredientRow: Codable, Identifiable, Hashable {
  let id: Int64
  var name: String
  var category: String?
  var currentStock: String?
  var minimumStock: String?
  var maximumStock: String?

  enum CodingKeys: String, CodingKey {
    case id
    case name
    case category
    case currentStock = "current_stock"
    case minimumStock = "minimum_stock"
    case maximumStock = "maximum_stock"
  }
}
