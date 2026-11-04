import SwiftUI
import ToucheGrasseCore

struct FoodSearchView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""
    @State private var savedOnly = false
    @State private var results: [SearchResult] = []
    @State private var searching = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle("Mitt bibliotek", isOn: $savedOnly)
                    Text("Søk på norsk eller engelsk. Alle treff ligger på telefonen.").font(.footnote).foregroundStyle(TG.secondary)
                }
                Section(savedOnly ? "Dine matvarer" : "Matvarer") {
                    if searching { ProgressView("Søker …") }
                    if results.isEmpty && !searching {
                        EmptyNote(title: "Ingen treff ennå", detail: "Prøv et annet navn, eller legg inn en egen matvare i hurtigregistreringen.")
                        Button("Legg inn egen matvare") { model.quickEntryPresented = true }
                    }
                    ForEach(results) { result in
                        HStack {
                            Button { model.add(result.food) } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(result.food.name).foregroundStyle(TG.ink)
                                    SourceLabel(food: result.food)
                                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }.buttonStyle(.borderless).accessibilityIdentifier("search.result.\(result.id)")
                            Button { Task { await model.save(result.food); await search() } } label: {
                                Image(systemName: result.saved ? "bookmark.fill" : "bookmark").frame(width: 44, height: 44)
                            }.buttonStyle(.borderless).accessibilityLabel(result.saved ? "Lagret i biblioteket" : "Lagre \(result.food.name)")
                        }
                    }
                }
            }.scrollContentBackground(.hidden).background(TG.background)
                .navigationTitle("Finn mat")
                .searchable(text: $query, prompt: "Matvare eller engelsk navn")
                .task(id: "\(query)|\(savedOnly)") { await search() }
                .onSubmit(of: .search) {
                    if results.isEmpty { Task { try? await model.store?.recordSearchEvent(query: query, kind: "no_results") } }
                }
                .toolbar { Button { model.quickEntryPresented = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.accessibilityLabel("Hurtigregistrering") }
        }
    }
    private func search() async {
        searching = true
        do {
            let found = try await model.store?.search(query, savedOnly: savedOnly) ?? []
            guard !Task.isCancelled else { return }
            results = found; searching = false
        } catch {
            guard !Task.isCancelled else { return }
            searching = false; model.errorMessage = error.localizedDescription
        }
    }
}
