/* AgentSwitcher — jump to another agent's eval dashboard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";

export function AgentSwitcher({
  agents,
  value,
  onChange,
}: {
  agents: { id: string; name: string }[];
  value: string;
  onChange: (agentId: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <select
      aria-label={t("dashboard.switchAgent")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
    >
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
