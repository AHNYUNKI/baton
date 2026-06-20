import Foundation

public func teamRunStatusByRole(_ teamRun: TeamRun) -> [String: String] {
    var statusByRole: [String: String] = [:]
    for role in teamRun.roles {
        statusByRole[role.roleId] = role.status
    }
    return statusByRole
}

public func teamRunStatusLabel(_ status: String) -> String {
    switch status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "planned":
        "계획됨"
    case "running":
        "진행 중"
    case "awaiting-approval":
        "승인 대기"
    case "awaiting-review":
        "검토 대기"
    case "awaiting-checkpoint":
        "검토 대기"
    case "completed":
        "완료"
    case "failed":
        "실패"
    case "cancelled":
        "취소됨"
    case "skipped":
        "건너뜀"
    default:
        status
    }
}

public func displayExplanation(_ raw: String) -> String {
    let trimmedRaw = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedRaw.isEmpty else {
        return ""
    }

    let normalized = raw
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
    let lines = normalized.components(separatedBy: "\n")
    guard let firstContentIndex = lines.firstIndex(where: { line in
        !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }) else {
        return ""
    }

    guard lines[firstContentIndex].trimmingCharacters(in: .whitespacesAndNewlines) == "## 학습 설명" else {
        return trimmedRaw
    }

    let remaining = lines.dropFirst(firstContentIndex + 1).joined(separator: "\n")
    return remaining.trimmingCharacters(in: .whitespacesAndNewlines)
}
