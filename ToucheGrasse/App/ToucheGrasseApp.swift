import SwiftUI

@main
struct ToucheGrasseApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).tint(TG.action).preferredColorScheme(.light)
                .task { await model.start() }
        }
    }
}
struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            if model.isLoading {
                VStack(spacing: 20) {
                    Text("Touche Grasse").font(.system(.largeTitle, design: .serif, weight: .bold))
                    ProgressView("Klargjør matbiblioteket …")
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(TG.background)
            } else if model.store == nil {
                VStack(spacing: 16) {
                    Text("Biblioteket kunne ikke åpnes").font(.title2)
                    Text("Dine data blir ikke slettet. Prøv igjen.")
                    Button("Prøv igjen") { Task { await model.start() } }
                }.padding()
            } else {
                TabView {
                    TodayView().tabItem { Label("I dag", systemImage: "list.bullet.rectangle") }
                    FoodSearchView().tabItem { Label("Søk", systemImage: "magnifyingglass") }
                    RecipesView().tabItem { Label("Oppskrifter", systemImage: "book.closed") }
                }
                .sheet(isPresented: $model.quickEntryPresented) { QuickEntryView() }
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let notice = model.notice {
                        HStack {
                            Text(notice).font(.footnote)
                            Spacer()
                            if !model.undoIDs.isEmpty { Button("Angre") { Task { await model.undo() } }.frame(minHeight: 44) }
                            Button { model.notice = nil } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Lukk beskjed")
                        }.padding(.horizontal).background(TG.selection).foregroundStyle(TG.ink)
                    }
                }
            }
        }
        .alert("Kunne ikke fullføre", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { Text(model.errorMessage ?? "") }
        .onChange(of: scenePhase) { _, phase in if phase != .active { Task { await model.flushDraft() } } }
    }
}
