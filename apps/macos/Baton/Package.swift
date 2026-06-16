// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Baton",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "BatonApp", targets: ["BatonApp"]),
        .library(name: "BatonKit", targets: ["BatonKit"])
    ],
    targets: [
        .target(name: "BatonKit"),
        .executableTarget(
            name: "BatonApp",
            dependencies: ["BatonKit"]
        ),
        .testTarget(
            name: "BatonKitTests",
            dependencies: ["BatonKit"],
            resources: [
                .process("Fixtures")
            ]
        )
    ]
)
