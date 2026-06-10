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

enum RuleStore {
    static let version = "2026.06.10"

    static let categories: [RuleCategory] = [
        RuleCategory(
            id: "chat",
            name: "AI Chat",
            symbol: "sparkles",
            colorHex: 0x0f9f8f,
            services: [
                RuleService(name: "OpenAI ChatGPT", domains: ["chatgpt.com", "chat.openai.com", "openai.com", "oaistatic.com", "oaiusercontent.com"]),
                RuleService(name: "Anthropic Claude", domains: ["claude.ai", "console.anthropic.com", "anthropic.com"]),
                RuleService(name: "Google Gemini", domains: ["gemini.google.com", "bard.google.com", "aistudio.google.com"]),
                RuleService(name: "Meta AI", domains: ["meta.ai", "ai.meta.com"]),
                RuleService(name: "Poe", domains: ["poe.com"]),
                RuleService(name: "Character.AI", domains: ["character.ai", "beta.character.ai"])
            ]
        ),
        RuleCategory(
            id: "search",
            name: "AI Search",
            symbol: "magnifyingglass",
            colorHex: 0xe49b29,
            services: [
                RuleService(name: "Perplexity", domains: ["perplexity.ai", "www.perplexity.ai"]),
                RuleService(name: "Microsoft Copilot", domains: ["copilot.microsoft.com", "bing.com", "edgeservices.bing.com"]),
                RuleService(name: "You.com", domains: ["you.com", "youcdn.io"]),
                RuleService(name: "Phind", domains: ["phind.com"]),
                RuleService(name: "Grok", domains: ["grok.com", "x.ai"])
            ]
        ),
        RuleCategory(
            id: "coding",
            name: "AI Coding",
            symbol: "curlybraces",
            colorHex: 0x5967d8,
            services: [
                RuleService(name: "GitHub Copilot", domains: ["githubcopilot.com", "api.githubcopilot.com", "copilot-proxy.githubusercontent.com"]),
                RuleService(name: "Cursor", domains: ["cursor.com", "api2.cursor.sh", "cursor.sh"]),
                RuleService(name: "Replit AI", domains: ["replit.com", "replit.ai"]),
                RuleService(name: "Blackbox AI", domains: ["blackbox.ai", "www.blackbox.ai"]),
                RuleService(name: "Codeium", domains: ["codeium.com", "windsurf.com"])
            ]
        ),
        RuleCategory(
            id: "creative",
            name: "Image/Video AI",
            symbol: "wand.and.stars",
            colorHex: 0xce4f4f,
            services: [
                RuleService(name: "Midjourney", domains: ["midjourney.com", "www.midjourney.com"]),
                RuleService(name: "Runway", domains: ["runwayml.com", "app.runwayml.com"]),
                RuleService(name: "Stability AI", domains: ["stability.ai", "platform.stability.ai"]),
                RuleService(name: "Leonardo AI", domains: ["leonardo.ai", "app.leonardo.ai"]),
                RuleService(name: "Ideogram", domains: ["ideogram.ai"]),
                RuleService(name: "Suno", domains: ["suno.com", "suno.ai"]),
                RuleService(name: "Udio", domains: ["udio.com"]),
                RuleService(name: "ElevenLabs", domains: ["elevenlabs.io", "api.elevenlabs.io"])
            ]
        ),
        RuleCategory(
            id: "api",
            name: "AI APIs",
            symbol: "globe",
            colorHex: 0x1482a5,
            services: [
                RuleService(name: "OpenAI API", domains: ["api.openai.com", "platform.openai.com"]),
                RuleService(name: "Anthropic API", domains: ["api.anthropic.com"]),
                RuleService(name: "Google AI API", domains: ["generativelanguage.googleapis.com", "ai.google.dev"]),
                RuleService(name: "Mistral AI", domains: ["mistral.ai", "chat.mistral.ai", "api.mistral.ai", "console.mistral.ai"]),
                RuleService(name: "Replicate", domains: ["replicate.com", "api.replicate.com"]),
                RuleService(name: "Hugging Face", domains: ["huggingface.co", "api-inference.huggingface.co"], strictOnly: true)
            ]
        )
    ]

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
