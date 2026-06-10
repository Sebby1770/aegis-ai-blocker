import SwiftUI
import UIKit

struct ContentView: View {
    @State private var enabledCategories = Set(RuleStore.categories.map(\.id))
    @State private var strictMode = false
    @State private var testerValue = "chatgpt.com"
    @State private var licenseActive = true
    @State private var copied = false

    private var activeDomains: [String] {
        RuleStore.activeDomains(enabledCategories: enabledCategories, strictMode: strictMode)
    }

    private var exportText: String {
        RuleStore.adguardExport(domains: activeDomains)
    }

    private var matchedDomain: String? {
        RuleStore.match(input: testerValue, domains: activeDomains)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    summarySection
                    categorySection
                    testerSection
                    exportSection
                    licenseSection
                }
                .padding(18)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Aegis AI Blocker")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        strictMode.toggle()
                    } label: {
                        Image(systemName: strictMode ? "lock.shield.fill" : "lock.shield")
                    }
                    .accessibilityLabel("Toggle strict mode")
                }
            }
        }
    }

    private var summarySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "shield.checkered")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.teal)
                    .frame(width: 44, height: 44)
                    .background(.teal.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Protection live")
                        .font(.title2.weight(.bold))
                    Text("Known limitation: new AI services need rule updates.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                metric(title: "Domains", value: "\(activeDomains.count)")
                Divider()
                metric(title: "Services", value: "\(RuleStore.activeServiceCount(enabledCategories: enabledCategories, strictMode: strictMode))")
                Divider()
                metric(title: "Strict", value: strictMode ? "On" : "Off")
            }
            .frame(maxWidth: .infinity)
        }
        .cardStyle()
    }

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Blocklists")
                .font(.headline)

            ForEach(RuleStore.categories) { category in
                Toggle(isOn: binding(for: category.id)) {
                    HStack(spacing: 12) {
                        Image(systemName: category.symbol)
                            .foregroundStyle(Color(hex: category.colorHex))
                            .frame(width: 30)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(category.name)
                                .font(.subheadline.weight(.semibold))
                            Text("\(domainCount(for: category)) domains")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .toggleStyle(.switch)
            }
        }
        .cardStyle()
    }

    private var testerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rule tester")
                .font(.headline)

            TextField("URL or domain", text: $testerValue)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textFieldStyle(.roundedBorder)

            HStack {
                Image(systemName: matchedDomain == nil ? "checkmark.circle.fill" : "nosign")
                Text(matchedDomain.map { "Blocked by \($0)" } ?? "Allowed by current rules")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(matchedDomain == nil ? .teal : .red)
        }
        .cardStyle()
    }

    private var exportSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Export rules")
                .font(.headline)

            Text(exportText)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.green)
                .lineLimit(8)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 8))

            HStack {
                Button {
                    UIPasteboard.general.string = exportText
                    copied = true
                } label: {
                    Label(copied ? "Copied" : "Copy DNS rules", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)

                ShareLink(item: exportText) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .cardStyle()
    }

    private var licenseSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "key.horizontal.fill")
                    .foregroundStyle(.orange)
                Text("Lifetime license")
                    .font(.headline)
                Spacer()
                Text(licenseActive ? "Unlocked" : "Inactive")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(licenseActive ? .teal.opacity(0.14) : .red.opacity(0.12), in: Capsule())
            }

            Button(licenseActive ? "Deactivate demo" : "Activate demo") {
                licenseActive.toggle()
            }
            .buttonStyle(.bordered)
        }
        .cardStyle()
    }

    private func binding(for categoryID: String) -> Binding<Bool> {
        Binding(
            get: { enabledCategories.contains(categoryID) },
            set: { isEnabled in
                if isEnabled {
                    enabledCategories.insert(categoryID)
                } else {
                    enabledCategories.remove(categoryID)
                }
            }
        )
    }

    private func domainCount(for category: RuleCategory) -> Int {
        category.services
            .filter { strictMode || !$0.strictOnly }
            .flatMap(\.domains)
            .count
    }

    private func metric(title: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.weight(.bold))
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

private extension View {
    func cardStyle() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
    }
}

private extension Color {
    init(hex: UInt) {
        self.init(
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255
        )
    }
}

#Preview {
    ContentView()
}
