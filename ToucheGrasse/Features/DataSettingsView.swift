import SwiftUI
import UniformTypeIdentifiers
import ToucheGrasseCore

private struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data = Data()) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
struct DataSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var document = BackupDocument()
    @State private var exporting = false
    @State private var importing = false
    @State private var pendingImport: Data?
    @State private var confirmingImport = false
    @State private var busy = false
    @State private var status: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Dine data, på din telefon") {
                    Text("Ingen konto, reklame eller analyse-SDK. Matdagbok og bibliotek lagres lokalt. Eksportfiler inneholder personlige opplysninger; velg selv hvor du oppbevarer dem.")
                    Button("Eksporter sikkerhetskopi") { Task {
                        busy = true; defer { busy = false }
                        do { await model.flushDraft(); if let data = try await model.store?.exportData() { document = BackupDocument(data: data); exporting = true } }
                        catch { model.errorMessage = error.localizedDescription }
                    } }
                    Button("Gjenopprett fra fil") { importing = true }
                    Text("Gjenoppretting fletter inn registreringer og oppskrifter. Matvarer og oppskrifter med samme ID kan oppdateres; historiske registreringer beholdes.").font(.footnote)
                }
                Section("Søkehistorikk") {
                    Text("Inntil 100 mislykkede søk og treffvalg lagres bare lokalt. De er ikke med i eksporten.").font(.footnote)
                    Button("Slett lokal søkehistorikk", role: .destructive) { Task {
                        do { try await model.store?.clearSearchHistory(); status = "Søkehistorikken er slettet" }
                        catch { model.errorMessage = error.localizedDescription }
                    } }
                }
                Section("Matgrunnlag") {
                    Text("Matvaretabellen · Mattilsynet\n2 121 matvarer · hentet 22. oktober 2026")
                    Link("Kilde og API", destination: URL(string: "https://www.matvaretabellen.no/api/")!)
                    Text("Verdiene gjelder spiselig del per 100 g. Rå og tilberedt mat er forskjellige oppføringer.").font(.footnote)
                }
                if let status { Text(status) }
            }.disabled(busy).navigationTitle("Data og personvern").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Ferdig") { dismiss() }.disabled(busy) }
                .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "ToucheGrasse-backup") { result in
                    switch result { case .success: status = "Sikkerhetskopien er eksportert"; case .failure(let error): model.errorMessage = error.localizedDescription }
                }
                .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                    do {
                        let url = try result.get()
                        let granted = url.startAccessingSecurityScopedResource()
                        defer { if granted { url.stopAccessingSecurityScopedResource() } }
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= 50_000_000 else { throw StorageError(message: "Filen er for stor.") }
                        pendingImport = try Data(contentsOf: url); confirmingImport = true
                    } catch { model.errorMessage = error.localizedDescription }
                }
                .confirmationDialog("Flett inn sikkerhetskopien?", isPresented: $confirmingImport, titleVisibility: .visible) {
                    Button("Gjenopprett") { Task {
                        busy = true; defer { busy = false; pendingImport = nil }
                        do {
                            await model.flushDraft()
                            if let pendingImport { try await model.store?.restoreData(pendingImport) }
                            try await model.reloadDraft()
                            try await model.refresh(); status = "Sikkerhetskopien er gjenopprettet"
                        } catch { model.errorMessage = error.localizedDescription }
                    } }
                    Button("Avbryt", role: .cancel) { pendingImport = nil }
                } message: { Text("Lag gjerne en eksport først. Eksisterende loggoppføringer blir ikke overskrevet.") }
        }
    }
}
