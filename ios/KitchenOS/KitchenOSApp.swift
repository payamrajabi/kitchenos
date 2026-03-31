import SwiftUI

@main
struct KitchenOSApp: App {
  @StateObject private var appModel = AppModel()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(appModel)
        .onOpenURL { url in
          appModel.handleOpenURL(url)
        }
    }
  }
}
