import Foundation

public enum RoleDisplay {
    public static func koreanLabel(role: String) -> String {
        switch normalized(role) {
        case "analyst", "analyze":
            "분석"
        case "architect", "design":
            "설계"
        case "implementer", "implement":
            "구현"
        case "tester", "test":
            "테스트"
        case "reviewer", "review":
            "리뷰"
        case "fixer", "fix":
            "수정"
        case "release_writer", "release-writer", "finalize":
            "릴리스"
        case "approve", "approval":
            "승인"
        default:
            role
        }
    }

    public static func koreanLabel(stepType: WorkflowStepType) -> String {
        koreanLabel(role: stepType.rawValue)
    }

    public static func tint(role: String) -> BatonDisplayTint {
        switch normalized(role) {
        case "analyst", "analyze":
            BatonDisplayTint(name: "analyst", leadingHex: "#38BDF8", trailingHex: "#818CF8")
        case "architect", "design":
            BatonDisplayTint(name: "architect", leadingHex: "#8B5CF6", trailingHex: "#EC4899")
        case "implementer", "implement":
            BatonDisplayTint(name: "implementer", leadingHex: "#2DD4BF", trailingHex: "#22C55E")
        case "tester", "test":
            BatonDisplayTint(name: "tester", leadingHex: "#F59E0B", trailingHex: "#FACC15")
        case "reviewer", "review":
            BatonDisplayTint(name: "reviewer", leadingHex: "#F472B6", trailingHex: "#A78BFA")
        case "fixer", "fix":
            BatonDisplayTint(name: "fixer", leadingHex: "#FB7185", trailingHex: "#F97316")
        case "release_writer", "release-writer", "finalize":
            BatonDisplayTint(name: "release-writer", leadingHex: "#A3E635", trailingHex: "#22C55E")
        case "approve", "approval":
            BatonDisplayTint.awaitingApproval
        default:
            BatonDisplayTint.muted
        }
    }

    public static func tint(stepType: WorkflowStepType) -> BatonDisplayTint {
        tint(role: stepType.rawValue)
    }

    private static func normalized(_ role: String) -> String {
        role.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }
}
