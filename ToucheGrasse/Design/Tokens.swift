import SwiftUI
import ToucheGrasseCore

enum TG {
    // Owner-selected base palette. Do not change these values to fix contrast; use semantic tokens.
    static let ocean = Color(hex: 0x4B8299)
    static let forrest = Color(hex: 0x44724F)
    static let skyline = Color(hex: 0x99BFDF)
    static let tangerine = Color(hex: 0xE99E26)
    static let toffee = Color(hex: 0xDA682F)
    static let salsa = Color(hex: 0xDB3100)
    static let background = Color(hex: 0xFAF8F2)
    static let surface = Color(hex: 0xFFFFFF)
    static let ink = Color(hex: 0x172B32)
    static let secondary = Color(hex: 0x52626A)
    static let action = Color(hex: 0x28566B)
    static let error = Color(hex: 0xAC2B09)
    static let divider = Color(hex: 0xD9DFDB)
    static let selection = Color(hex: 0xE6EFF1)
    enum Space {
        static let tight: CGFloat = 4
        static let small: CGFloat = 8
        static let regular: CGFloat = 16
        static let section: CGFloat = 24
    }
    enum Radius {
        static let control: CGFloat = 8
        static let panel: CGFloat = 12
    }
    static let motionSeconds = 0.16
}
private extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1)
    }
}
struct NutritionStrip: View {
    var nutrition: Nutrition
    var body: some View {
        VStack(alignment: .leading, spacing: TG.Space.small) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Numbers.display(nutrition.kcal, digits: 0)).font(.system(.largeTitle, design: .rounded, weight: .semibold)).monospacedDigit()
                Text("kcal").font(.subheadline).foregroundStyle(TG.secondary)
            }.accessibilityElement(children: .combine)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 20) { macro("Protein", nutrition.protein); macro("Karbohydrat", nutrition.carbohydrate); macro("Fett", nutrition.fat) }
                VStack(alignment: .leading, spacing: 8) { macro("Protein", nutrition.protein); macro("Karbohydrat", nutrition.carbohydrate); macro("Fett", nutrition.fat) }
            }
            if !nutrition.isComplete {
                Label("Noen næringsverdier mangler", systemImage: "info.circle").font(.footnote).foregroundStyle(TG.secondary)
            }
        }.foregroundStyle(TG.ink).padding(.vertical, 8)
    }
    private func macro(_ title: String, _ value: Decimal?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(TG.secondary)
            Text("\(Numbers.display(value)) g").font(.subheadline.weight(.semibold)).monospacedDigit()
        }.accessibilityElement(children: .combine)
    }
}
struct SourceLabel: View {
    let food: Food
    private var sourceName: String {
        switch food.provenance.source {
        case .matvaretabellen: return "Matvaretabellen"
        case .manual: return "Egen matvare"
        case .confirmedOCR: return "Bekreftet etikett"
        case .openFoodFacts: return "Open Food Facts"
        }
    }
    var body: some View {
        Text("\(sourceName) · per 100 \(food.referenceUnit.rawValue)")
            .font(.caption).foregroundStyle(TG.secondary)
    }
}
struct EmptyNote: View {
    let title: String
    let detail: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundStyle(TG.ink)
            Text(detail).font(.subheadline).foregroundStyle(TG.secondary)
        }.padding(.vertical, 16)
    }
}
