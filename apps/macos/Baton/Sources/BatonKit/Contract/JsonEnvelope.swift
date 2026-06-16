import Foundation

public let batonReadAPISchemaVersion = 1

public enum BatonContractError: Error, Equatable, LocalizedError, Sendable {
    case unsupportedSchemaVersion(expected: Int, actual: Int)

    public var errorDescription: String? {
        switch self {
        case let .unsupportedSchemaVersion(expected, actual):
            "Unsupported Baton schemaVersion \(actual); expected \(expected)."
        }
    }
}

public struct JsonEnvelope<Payload: Codable>: Codable, Equatable, Sendable where Payload: Equatable & Sendable {
    public let schemaVersion: Int
    public let kind: String
    public let data: Payload

    public init(schemaVersion: Int = batonReadAPISchemaVersion, kind: String, data: Payload) throws {
        guard schemaVersion == batonReadAPISchemaVersion else {
            throw BatonContractError.unsupportedSchemaVersion(expected: batonReadAPISchemaVersion, actual: schemaVersion)
        }
        self.schemaVersion = schemaVersion
        self.kind = kind
        self.data = data
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == batonReadAPISchemaVersion else {
            throw BatonContractError.unsupportedSchemaVersion(expected: batonReadAPISchemaVersion, actual: schemaVersion)
        }
        self.schemaVersion = schemaVersion
        self.kind = try container.decode(String.self, forKey: .kind)
        self.data = try container.decode(Payload.self, forKey: .data)
    }
}
