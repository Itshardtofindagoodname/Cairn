"use client";

import { useEffect, useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import { X } from "lucide-react";
import type { GraphEdge, GraphNode, ProvenanceGraph } from "@/lib/graph";
import { SOURCE_META, TYPE_META } from "./sourceMeta";
import { ResultCard } from "./ResultCard";

const EDGE_COLORS: Record<GraphEdge["kind"], string> = {
  mentions: "#f59e0b",
  "same-entity-as": "#a78bfa",
  "same-author-as": "#34d399",
};

const EDGE_LABELS: Record<GraphEdge["kind"], string> = {
  mentions: "mentions",
  "same-entity-as": "same entity",
  "same-author-as": "same author",
};

interface GraphViewProps {
  graph: ProvenanceGraph;
}

function graphKey(graph: ProvenanceGraph): string {
  return `${graph.nodes.length}:${graph.nodes.map((n) => n.uid).join("|")}:${graph.edges
    .map((e) => `${e.id}:${e.confidence.toFixed(2)}`)
    .join("|")}`;
}

export function GraphView({ graph }: GraphViewProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  const currentKey = useMemo(() => graphKey(graph), [graph]);

  // Load a new graph by key (adjust-state-during-render pattern — lint-safe
  // and avoids a cascading-render effect).
  if (currentKey !== loadedKey) {
    setLoadedKey(currentKey);
    setNodes(graph.nodes.map((n) => ({ ...n })));
    setEdges(graph.edges);
    setSelected(null);
  }

  useEffect(() => {
    const simNodes = graph.nodes.map((n) => ({ ...n }));
    if (simNodes.length === 0) return;

    const width = 900;
    const height = 520;

    const sim = forceSimulation<SimulationNodeDatum>(simNodes as SimulationNodeDatum[])
      .force(
        "link",
        forceLink<SimulationNodeDatum, GraphEdge>(edges)
          .id((d) => (d as GraphNode).id)
          .distance(90)
          .strength(0.5),
      )
      .force("charge", forceManyBody<SimulationNodeDatum>().strength(-320))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<SimulationNodeDatum>().radius(36))
      .alpha(0.9)
      .on("tick", () => {
        // Mutating in place then cloning keeps React cheap per tick.
        setNodes([...sim.nodes() as unknown as GraphNode[]]);
      });

    return () => {
      sim.stop();
    };
  }, [graph, edges]);

  const legendSources = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.source))],
    [graph],
  );

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-10 text-center text-sm text-zinc-500">
        No results to graph yet — run a search first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
        <svg
          ref={undefined}
          viewBox="0 0 900 520"
          className="h-[520px] w-full"
          role="img"
          aria-label="Cross-source provenance graph"
        >
          {/* Edge hit targets are drawn underneath for easier hovering. */}
          {edges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;
            return (
              <g key={edge.id}>
                <line
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  stroke={hoveredEdge?.id === edge.id ? EDGE_COLORS[edge.kind] : `${EDGE_COLORS[edge.kind]}55`}
                  strokeWidth={hoveredEdge?.id === edge.id ? 2.5 : 1.5}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredEdge(edge)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
              </g>
            );
          })}

          {nodes.map((node) => {
            const sourceMeta = SOURCE_META[node.source];
            const typeMeta = TYPE_META[node.type];
            const isSelected = selected?.id === node.id;
            const x = node.x ?? 50;
            const y = node.y ?? 200;
            const glyph =
              typeMeta.icon;
            return (
              <g
                key={node.id}
                transform={`translate(${x},${y})`}
                className="cursor-pointer"
                onClick={() => setSelected(node)}
              >
                <circle
                  r={isSelected ? 15 : 12}
                  fill={sourceMeta.dot}
                  stroke={isSelected ? "#fbbf24" : "#18181b"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  y={6}
                  textAnchor="middle"
                  style={{ fontSize: 10, fill: "#09090b", pointerEvents: "none" }}
                >
                  {glyphChar(glyph)}
                </text>
                <text
                  y={26}
                  textAnchor="middle"
                  className="fill-zinc-400"
                  style={{ fontSize: 9, fontWeight: 500, pointerEvents: "none" }}
                >
                  {node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredEdge && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 shadow-lg shadow-black/30">
            <span
              className="mr-2 inline-block rounded px-1.5 py-px text-[10px] font-semibold"
              style={{ backgroundColor: `${EDGE_COLORS[hoveredEdge.kind]}22`, color: EDGE_COLORS[hoveredEdge.kind] }}
            >
              {EDGE_LABELS[hoveredEdge.kind]}
            </span>
            {hoveredEdge.reason}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2 right-3 flex flex-wrap items-center gap-2">
          {legendSources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-500"
            >
              <span
                className={`h-2 w-2 rounded-full ${SOURCE_META[source].dot}`}
              />
              {SOURCE_META[source].short}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close node card"
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-600">
            Node · {selected.title}
          </p>
          <ResultCard result={selected.result} />
        </div>
      )}
    </div>
  );
}

function glyphChar(icon: { displayName?: string }): string {
  switch (icon.displayName ?? icon.displayName) {
    case "Database":
      return "D";
    case "Cpu":
      return "M";
    case "FileText":
      return "P";
    case "GitFork":
      return "R";
    default:
      return "•";
  }
}
