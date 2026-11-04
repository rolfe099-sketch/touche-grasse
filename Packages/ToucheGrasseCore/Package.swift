// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ToucheGrasseCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "ToucheGrasseCore", targets: ["ToucheGrasseCore"])],
    targets: [
        .systemLibrary(name: "CSQLite", pkgConfig: "sqlite3", providers: [.apt(["libsqlite3-dev"]), .brew(["sqlite3"])]),
        .target(name: "ToucheGrasseCore", dependencies: ["CSQLite"], resources: [.process("Resources")]),
        .testTarget(name: "ToucheGrasseCoreTests", dependencies: ["ToucheGrasseCore"])
    ]
)
