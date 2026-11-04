import SwiftUI
import ToucheGrasseCore

struct TodayView: View {
    @EnvironmentObject private var model: AppModel
    @State private var settingsPresented = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Touche Grasse").font(.system(.title2, design: .serif, weight: .bold)).foregroundStyle(TG.action)
                    DatePicker("Matdagbok", selection: $model.selectedDate, in: ...Date(), displayedComponents: .date)
                    NutritionStrip(nutrition: Nutrition.total(model.logs.map(\.nutrition)))
                        .accessibilityIdentifier("today.totals")
                    Button { model.quickEntryPresented = true } label: {
                        Label(model.draft.lines.isEmpty && model.draft.text.isEmpty ? "Legg til mat" : "Fortsett registreringen", systemImage: "plus")
                            .font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                    }.buttonStyle(.borderedProminent).accessibilityIdentifier("today.add")
                }.listRowBackground(TG.background)
                if model.logs.isEmpty {
                    Section { EmptyNote(title: "Plass til dagens mat", detail: "Finn en matvare, velg mengde og legg den til. Mat du bruker, blir liggende klar til neste gang.") }
                }
                ForEach(Meal.allCases, id: \.self) { meal in
                    let entries = model.logs.filter { $0.meal == meal }
                    if !entries.isEmpty {
                        Section(meal.rawValue) {
                            ForEach(entries) { entry in LogRow(entry: entry) }
                        }
                    }
                }
                if !model.recent.isEmpty {
                    Section("Bruk igjen") {
                        ForEach(Array(model.recent.prefix(4))) { entry in LogRow(entry: entry) }
                    }
                }
            }.scrollContentBackground(.hidden).background(TG.background)
                .navigationTitle("Matdagbok").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) {
                    Button { settingsPresented = true } label: { Image(systemName: "gearshape").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Data og personvern")
                } }
                .sheet(isPresented: $settingsPresented) { DataSettingsView() }
                .task(id: Calendar.current.startOfDay(for: model.selectedDate)) {
                    do { try await model.refresh() } catch { model.errorMessage = error.localizedDescription }
                }
        }
    }
}
private struct LogRow: View {
    @EnvironmentObject private var model: AppModel
    let entry: LogEntry
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.ingredient.food.name).font(.body.weight(.medium)).foregroundStyle(TG.ink)
                Text("\(Numbers.display(entry.ingredient.quantity)) \(entry.ingredient.unit.rawValue) · \(Numbers.display(entry.nutrition.kcal, digits: 0)) kcal")
                    .font(.subheadline).monospacedDigit().foregroundStyle(TG.secondary)
                Text(entry.recordedAt, style: .time).font(.caption).foregroundStyle(TG.secondary)
            }.accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            Button { Task { await model.repeatLog(entry) } } label: { Image(systemName: "plus.circle").font(.title2).frame(width: 44, height: 44) }
                .buttonStyle(.borderless).disabled(model.busy).accessibilityLabel("Logg \(entry.ingredient.food.name) igjen i dag")
                .accessibilityIdentifier("log.repeat")
        }.padding(.vertical, 4)
    }
}
