/* CostBreakdown — cost by agent and by run model as two text lists (the source of truth
   for screen readers), each with a decorative donut beside it. */
import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import type { CostByAgent, CostByModel } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge/format";
import { SWATCHES } from "./constants";
import { donutGradient, roundedSumDiffers } from "./helpers";
import { s } from "./styles";

interface Bucket {
  key: string;
  name: string;
  cost: number | null;
}

export function CostBreakdown({
  byAgent,
  byModel,
  total,
}: {
  byAgent: CostByAgent[];
  byModel: CostByModel[];
  total: number | null;
}) {
  const t = useTranslations("agentPerformance");
  const agents: Bucket[] = byAgent.map((b) => ({
    key: b.agent_id ?? "\u0000deleted",
    name: b.agent_name ?? t("table.deletedAgent"),
    cost: b.total_cost_usd,
  }));
  const models: Bucket[] = byModel.map((b) => ({
    key: b.model ?? "\u0000unknown",
    name: b.model ?? t("breakdown.unknownModel"),
    cost: b.total_cost_usd,
  }));
  const costs = (buckets: Bucket[]) => buckets.map((b) => b.cost);
  const differs = roundedSumDiffers(costs(agents), total) || roundedSumDiffers(costs(models), total);

  return (
    <section style={s.section}>
      <SectionLabel icon="DollarSign" right={<span style={s.hint}>{t("estimate")}</span>}>
        {t("breakdown.title")}
      </SectionLabel>
      <div style={s.grid}>
        <BucketList title={t("breakdown.byAgent")} buckets={agents} />
        <BucketList title={t("breakdown.byModel")} buckets={models} />
      </div>
      {differs ? <p style={s.footnote}>{t("breakdown.roundingNote")}</p> : null}
    </section>
  );
}

function BucketList({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const gradient = donutGradient(buckets.map((b) => b.cost), SWATCHES);
  return (
    <Card>
      <div style={s.heading}>{title}</div>
      <div style={s.body}>
        {gradient ? (
          <div aria-hidden style={{ ...s.donut, background: gradient }}>
            <div style={s.donutHole} />
          </div>
        ) : null}
        <ul style={s.list}>
          {buckets.map((b, i) => (
            <li key={b.key} style={s.line}>
              <span aria-hidden style={{ ...s.swatch, background: SWATCHES[i % SWATCHES.length] }} />
              <span style={s.name} title={b.name}>
                {b.name}
              </span>
              <span style={s.cost}>{formatCost(b.cost, 3)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
