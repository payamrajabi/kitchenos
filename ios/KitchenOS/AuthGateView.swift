import SwiftUI

struct AuthGateView: View {
  @EnvironmentObject private var appModel: AppModel
  @State private var email = ""
  @State private var password = ""
  @State private var message = ""
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Email", text: $email)
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .keyboardType(.emailAddress)
          SecureField("Password", text: $password)
            .textContentType(.password)
        }
        if !message.isEmpty {
          Section {
            Text(message)
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        Section {
          Button("Continue with Google") {
            Task { await runGoogleSignIn() }
          }
          .disabled(busy)
          Button("Sign in") {
            Task { await runSignIn() }
          }
          .disabled(busy || email.isEmpty || password.isEmpty)
          Button("Sign up") {
            Task { await runSignUp() }
          }
          .disabled(busy || email.isEmpty || password.isEmpty)
        }
      }
      .navigationTitle("KitchenOS")
    }
  }

  private func runGoogleSignIn() async {
    busy = true
    message = ""
    defer { busy = false }
    do {
      try await appModel.signInWithGoogle()
      message = ""
    } catch {
      message = error.localizedDescription
    }
  }

  private func runSignIn() async {
    busy = true
    message = ""
    defer { busy = false }
    do {
      try await appModel.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
      message = ""
    } catch {
      message = error.localizedDescription
    }
  }

  private func runSignUp() async {
    busy = true
    message = ""
    defer { busy = false }
    do {
      try await appModel.signUp(email: email.trimmingCharacters(in: .whitespaces), password: password)
      message = "Check your email to confirm if required, then sign in."
    } catch {
      message = error.localizedDescription
    }
  }
}
