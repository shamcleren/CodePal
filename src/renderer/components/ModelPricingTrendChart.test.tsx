import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n";
import { ModelPricingTrendChart } from "./ModelPricingTrendChart";

describe("ModelPricingTrendChart", () => {
  it("renders the selected model pricing series and range events", () => {
    const html = renderToStaticMarkup(
        <I18nProvider locale="en">
        <ModelPricingTrendChart
          pricing={[
            {
              modelId: "claude-opus-4-8",
              displayName: "Claude Opus 4.8",
              inputPerMillion: "5",
              outputPerMillion: "25",
              cacheReadPerMillion: "0.50",
              cacheCreationPerMillion: "6.25",
            },
            {
              modelId: "claude-sonnet-4-6",
              displayName: "Claude Sonnet 4.6",
              inputPerMillion: "3",
              outputPerMillion: "15",
              cacheReadPerMillion: "0.30",
              cacheCreationPerMillion: "3.75",
            },
            {
              modelId: "claude-sonnet-4-20250514",
              displayName: "Claude Sonnet 4",
              inputPerMillion: "3",
              outputPerMillion: "15",
              cacheReadPerMillion: "0.30",
              cacheCreationPerMillion: "3.75",
              isCurrent: false,
            },
          ]}
          pricingHistory={[]}
          pricingUpdatedAt="2026-06-10"
          pricingChangeEvents={[
            {
              modelId: "claude-opus-4-8",
              displayName: "Claude Opus 4.8",
              effectiveFrom: Date.parse("2026-05-28T00:00:00.000Z"),
              changeKind: "new_model",
              inputPerMillion: "5",
              outputPerMillion: "25",
              note: "Launch",
            },
          ]}
          selectedVendorIds={[]}
          onSelectedVendorIdsChange={() => undefined}
          sortField="model"
          sortDirection="asc"
          onSortChange={() => undefined}
          rangeStartMs={Date.parse("2026-05-01T00:00:00.000Z")}
          rangeEndMs={Date.parse("2026-06-30T00:00:00.000Z")}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Model pricing");
    expect(html).toContain("Current model prices");
    expect(html).toContain("Updated Jun 10, 2026");
    expect(html).toContain("Claude Opus 4.8");
    expect(html).toContain("Claude Sonnet 4.6");
    expect(html).not.toContain("Claude Sonnet 4</button>");
    expect(html).toContain("Vendor filter");
    expect(html).toContain("All vendors");
    expect(html).not.toContain("History prices table");
  });
});
