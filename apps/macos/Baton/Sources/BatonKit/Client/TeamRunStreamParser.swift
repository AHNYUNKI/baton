import Foundation

public struct TeamRunStreamParser: Sendable {
    private var buffer = ""

    public init() {}

    public mutating func append(_ chunk: String) -> [TeamRunStreamItem] {
        buffer.append(chunk)
        var items: [TeamRunStreamItem] = []

        while let newlineIndex = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIndex])
            buffer.removeSubrange(...newlineIndex)
            if let item = decodeLine(line) {
                items.append(item)
            }
        }

        return items
    }

    public mutating func finish() -> [TeamRunStreamItem] {
        defer { buffer.removeAll() }
        guard !buffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }
        return decodeLine(buffer).map { [$0] } ?? []
    }

    private func decodeLine(_ line: String) -> TeamRunStreamItem? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let data = Data(trimmed.utf8)
        let decoder = JSONDecoder()
        guard let envelopeKind = try? decoder.decode(TeamRunStreamEnvelopeKind.self, from: data) else {
            return nil
        }

        switch envelopeKind.kind {
        case "event":
            guard let envelope = try? decoder.decode(JsonEnvelope<TeamRunStreamEvent>.self, from: data) else {
                return nil
            }
            return .event(envelope.data)
        case "team-run":
            guard let envelope = try? decoder.decode(JsonEnvelope<TeamRun>.self, from: data) else {
                return nil
            }
            return .final(envelope.data)
        default:
            return nil
        }
    }
}

private struct TeamRunStreamEnvelopeKind: Decodable {
    let kind: String

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == batonReadAPISchemaVersion else {
            throw BatonContractError.unsupportedSchemaVersion(expected: batonReadAPISchemaVersion, actual: schemaVersion)
        }
        self.kind = try container.decode(String.self, forKey: .kind)
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case kind
    }
}
