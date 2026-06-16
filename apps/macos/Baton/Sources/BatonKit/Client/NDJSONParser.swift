import Foundation

public enum NDJSONParserError: Error, Equatable, LocalizedError, Sendable {
    case unexpectedEnvelopeKind(expected: String, actual: String)

    public var errorDescription: String? {
        switch self {
        case let .unexpectedEnvelopeKind(expected, actual):
            "Unexpected NDJSON envelope kind \(actual); expected \(expected)."
        }
    }
}

public struct NDJSONParser: Sendable {
    private var buffer = ""

    public init() {}

    public mutating func append(_ chunk: String) throws -> [WatchEvent] {
        buffer.append(chunk)
        var events: [WatchEvent] = []

        while let newlineIndex = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIndex])
            buffer.removeSubrange(...newlineIndex)
            if let event = try decodeLine(line) {
                events.append(event)
            }
        }

        return events
    }

    public mutating func finish() throws -> [WatchEvent] {
        defer { buffer.removeAll() }
        guard !buffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }
        return try decodeLine(buffer).map { [$0] } ?? []
    }

    private func decodeLine(_ line: String) throws -> WatchEvent? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let envelope = try JSONDecoder().decode(WatchEventEnvelope.self, from: Data(trimmed.utf8))
        return envelope.data
    }
}

private struct WatchEventEnvelope: Decodable {
    let data: WatchEvent

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == batonReadAPISchemaVersion else {
            throw BatonContractError.unsupportedSchemaVersion(expected: batonReadAPISchemaVersion, actual: schemaVersion)
        }

        let kind = try container.decode(String.self, forKey: .kind)
        guard kind == "event" else {
            throw NDJSONParserError.unexpectedEnvelopeKind(expected: "event", actual: kind)
        }

        self.data = try container.decode(WatchEvent.self, forKey: .data)
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case kind
        case data
    }
}
