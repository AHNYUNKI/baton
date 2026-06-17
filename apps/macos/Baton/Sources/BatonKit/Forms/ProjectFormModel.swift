import Foundation

public struct ProjectFormModel: Equatable, Sendable {
    public var name: String
    public var sourceKind: ProjectSourceKind
    public var sourceValue: String
    public var agentIds: [String]
    public var leadAgentId: String?

    public init(
        name: String = "",
        sourceKind: ProjectSourceKind = .local,
        sourceValue: String = "",
        agentIds: [String] = ["codex"],
        leadAgentId: String? = nil
    ) {
        self.name = name
        self.sourceKind = sourceKind
        self.sourceValue = sourceValue
        self.agentIds = agentIds
        self.leadAgentId = leadAgentId
    }

    public var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var trimmedSourceValue: String {
        sourceValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var normalizedAgentIds: [String] {
        var seen: Set<String> = []
        return agentIds
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }

    public var normalizedLeadAgentId: String? {
        let agents = normalizedAgentIds
        if agents.count == 1 {
            return agents[0]
        }

        guard let leadAgentId else {
            return nil
        }
        let trimmed = leadAgentId.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    public var isValid: Bool {
        guard !trimmedName.isEmpty, !trimmedSourceValue.isEmpty else {
            return false
        }
        guard isSourceValueValid else {
            return false
        }
        let agents = normalizedAgentIds
        guard !agents.isEmpty, agents.allSatisfy(AgentCatalog.contains) else {
            return false
        }
        guard agents.count > 1 else {
            return true
        }
        guard let lead = normalizedLeadAgentId else {
            return false
        }
        return agents.contains(lead)
    }

    public var canSubmit: Bool {
        isValid
    }

    public var isSourceValueValid: Bool {
        guard sourceKind == .github else {
            return !trimmedSourceValue.isEmpty
        }
        guard let url = URL(string: trimmedSourceValue) else {
            return false
        }
        return (url.scheme == "https" || url.scheme == "http") && url.host == "github.com"
    }

    public mutating func setAgent(_ id: String, enabled: Bool) {
        if enabled {
            if !agentIds.contains(id) {
                agentIds.append(id)
            }
        } else {
            agentIds.removeAll { $0 == id }
            if leadAgentId == id {
                leadAgentId = nil
            }
        }

        if normalizedAgentIds.count == 1 {
            leadAgentId = normalizedAgentIds[0]
        }
    }

    public func buildCreateArguments() -> [String] {
        var arguments = [
            "project",
            "create",
            "--name",
            trimmedName,
            "--source-kind",
            sourceKind.rawValue,
            "--source",
            trimmedSourceValue
        ]

        for agentId in normalizedAgentIds {
            arguments.append(contentsOf: ["--agent", agentId])
        }

        if normalizedAgentIds.count > 1, let lead = normalizedLeadAgentId {
            arguments.append(contentsOf: ["--lead", lead])
        }

        return arguments
    }
}
