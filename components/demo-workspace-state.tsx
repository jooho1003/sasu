"use client";

import { createContext, useContext, useState } from "react";
import type { DemoDecision } from "@/lib/demo-workspace";

const DemoState = createContext<{ decisions: DemoDecision[]; append: (decision: DemoDecision) => void }>({ decisions: [], append: () => {} });

export function DemoWorkspaceState({ children }: { children: React.ReactNode }) {
  const [decisions, setDecisions] = useState<DemoDecision[]>([]);
  return <DemoState.Provider value={{ decisions, append: decision => setDecisions(current => current.some(row => row.id === decision.id || (decision.supersedes_id && row.supersedes_id === decision.supersedes_id)) ? current : [...current, decision]) }}>{children}</DemoState.Provider>;
}

export const useDemoWorkspace = () => useContext(DemoState);
