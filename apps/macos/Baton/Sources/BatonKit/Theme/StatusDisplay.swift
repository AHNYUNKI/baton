import Foundation

public struct BatonDisplayTint: Equatable, Sendable {
    public let name: String
    public let leadingHex: String
    public let trailingHex: String

    public init(name: String, leadingHex: String, trailingHex: String) {
        self.name = name
        self.leadingHex = leadingHex
        self.trailingHex = trailingHex
    }
}

public enum StatusDisplay {
    public static func koreanLabel(_ status: RunStatus) -> String {
        switch status {
        case .planned:
            "대기"
        case .running:
            "실행 중"
        case .awaitingApproval:
            "승인 대기"
        case .completed:
            "완료"
        case .failed:
            "실패"
        case .cancelled:
            "취소됨"
        }
    }

    public static func koreanLabel(_ status: RunStepStatus) -> String {
        switch status {
        case .planned:
            "대기"
        case .running:
            "실행 중"
        case .completed:
            "완료"
        case .failed:
            "실패"
        case .skipped:
            "건너뜀"
        }
    }

    public static func koreanLabel(_ status: ApprovalStatus) -> String {
        switch status {
        case .pending:
            "승인 대기"
        case .approved:
            "승인됨"
        case .rejected:
            "거부됨"
        }
    }

    public static func tint(_ status: RunStatus) -> BatonDisplayTint {
        switch status {
        case .planned:
            .planned
        case .running:
            .running
        case .awaitingApproval:
            .awaitingApproval
        case .completed:
            .completed
        case .failed:
            .failed
        case .cancelled:
            .muted
        }
    }

    public static func tint(_ status: RunStepStatus) -> BatonDisplayTint {
        switch status {
        case .planned:
            .planned
        case .running:
            .running
        case .completed:
            .completed
        case .failed:
            .failed
        case .skipped:
            .muted
        }
    }

    public static func tint(_ status: ApprovalStatus) -> BatonDisplayTint {
        switch status {
        case .pending:
            .awaitingApproval
        case .approved:
            .completed
        case .rejected:
            .failed
        }
    }
}

public extension BatonDisplayTint {
    static let planned = BatonDisplayTint(name: "planned", leadingHex: "#8B5CF6", trailingHex: "#EC4899")
    static let running = BatonDisplayTint(name: "running", leadingHex: "#38BDF8", trailingHex: "#2DD4BF")
    static let awaitingApproval = BatonDisplayTint(name: "awaiting-approval", leadingHex: "#F59E0B", trailingHex: "#FACC15")
    static let completed = BatonDisplayTint(name: "completed", leadingHex: "#22C55E", trailingHex: "#A3E635")
    static let failed = BatonDisplayTint(name: "failed", leadingHex: "#EF4444", trailingHex: "#FB7185")
    static let muted = BatonDisplayTint(name: "muted", leadingHex: "#9A968C", trailingHex: "#6F6A60")
}
