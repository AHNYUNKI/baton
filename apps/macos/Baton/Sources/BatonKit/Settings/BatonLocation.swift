import Foundation

public enum BatonLocation {
    public static let defaultExecutable = "baton"

    public static func resolve(preference: String?) -> String {
        guard let preference else {
            return defaultExecutable
        }

        let trimmed = preference.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? defaultExecutable : trimmed
    }
}
