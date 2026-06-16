import BatonKit
import SwiftUI

enum BatonTheme {
    static let background = Color(batonHex: "#141414")
    static let backgroundRaised = Color(batonHex: "#1A1A1A")
    static let surface = Color(batonHex: "#1F1F1F")
    static let surfaceElevated = Color(batonHex: "#242424")
    static let cream = Color(batonHex: "#F2EAD8")
    static let muted = Color(batonHex: "#9A968C")
    static let separator = Color.white.opacity(0.08)
    static let amber = Color(batonHex: "#F59E0B")

    static let cardRadius: CGFloat = 16
    static let pillRadius: CGFloat = 999
    static let sidebarWidth: CGFloat = 340

    static let accentGradient = LinearGradient(
        colors: [Color(batonHex: "#8B5CF6"), Color(batonHex: "#EC4899")],
        startPoint: .leading,
        endPoint: .trailing
    )

    static func gradient(_ tint: BatonDisplayTint) -> LinearGradient {
        LinearGradient(
            colors: [Color(batonHex: tint.leadingHex), Color(batonHex: tint.trailingHex)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    static func softFill(_ tint: BatonDisplayTint) -> LinearGradient {
        LinearGradient(
            colors: [
                Color(batonHex: tint.leadingHex).opacity(0.24),
                Color(batonHex: tint.trailingHex).opacity(0.14)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

extension Color {
    init(batonHex hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") {
            cleaned.removeFirst()
        }

        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)

        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        self.init(red: red, green: green, blue: blue)
    }
}
