// Defined once, at module scope. Rebuilding this object per render makes React
// Flow remount every node on every event — which kills the CSS transitions the
// whole design leans on.

import type { NodeTypes } from "@xyflow/react";
import AgentNode from "./AgentNode";
import ClientNode from "./ClientNode";
import GoalNode from "./GoalNode";
import MarketplaceNode from "./MarketplaceNode";
import Tier2Node from "./Tier2Node";
import ColumnLabel from "./ColumnLabel";

export const nodeTypes: NodeTypes = {
  agent: AgentNode,
  client: ClientNode,
  goal: GoalNode,
  marketplace: MarketplaceNode,
  tier2: Tier2Node,
  columnLabel: ColumnLabel,
};
