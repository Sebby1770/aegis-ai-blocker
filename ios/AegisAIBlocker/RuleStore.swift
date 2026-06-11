import Foundation

struct RuleCategory: Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let colorHex: UInt
    let services: [RuleService]
}

struct RuleService: Identifiable, Hashable {
    var id: String { name }
    let name: String
    let domains: [String]
    var strictOnly: Bool = false
}

// Rule data lives in RulePackData.generated.swift, emitted from
// src/data/ai-services.json by scripts/generate-blocklists.mjs.
enum RuleStore {
    static let version = RulePackData.version

    static let categories: [RuleCategory] = RulePackData.categories

    static func activeDomains(enabledCategories: Set<String>, strictMode: Bool) -> [String] {
        let domains = categories
            .filter { enabledCategories.contains($0.id) }
            .flatMap(\.services)
            .filter { strictMode || !$0.strictOnly }
            .flatMap(\.domains)

        return Array(Set(domains)).sorted()
    }

    static func activeServiceCount(enabledCategories: Set<String>, strictMode: Bool) -> Int {
        categories
            .filter { enabledCategories.contains($0.id) }
            .flatMap(\.services)
            .filter { strictMode || !$0.strictOnly }
            .count
    }

    static func adguardExport(domains: [String]) -> String {
        let header = """
        # Aegis AI Blocker - AdGuard/uBlock DNS filters
        # Rule pack: \(version)
        # New AI services require rule updates.

        """

        return header + domains.map { "||\($0)^" }.joined(separator: "\n")
    }

    static func normalizedDomain(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return "" }

        if let url = URL(string: trimmed.contains("://") ? trimmed : "https://\(trimmed)") {
            return (url.host ?? trimmed).replacingOccurrences(of: "www.", with: "")
        }

        return trimmed.replacingOccurrences(of: "www.", with: "")
    }

    static func match(input: String, domains: [String]) -> String? {
        let domain = normalizedDomain(input)
        return domains.first { domain == $0 || domain.hasSuffix(".\($0)") }
    }
}
