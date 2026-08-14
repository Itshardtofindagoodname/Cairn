import { ImageResponse } from "next/og";
import { CairnMark } from "./cairn-mark";
import { SITE_NAME } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cairn — Search open datasets, models, papers and code";

const PROVIDERS = [
  "Hugging Face",
  "arXiv",
  "GitHub",
  "Zenodo",
  "data.gov",
  "OpenML",
  "Kaggle",
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 96px",
          background: "#09090b",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <CairnMark size={88} stroke="#f59e0b" strokeWidth={2} />
          <div style={{ fontSize: 76, letterSpacing: -2 }}>{SITE_NAME}</div>
        </div>
        <div
          style={{
            marginTop: 28,
            maxWidth: 860,
            fontSize: 30,
            lineHeight: 1.4,
            color: "#a1a1aa",
          }}
        >
          One query across Hugging Face, arXiv, GitHub, Zenodo, data.gov, OpenML
          &amp; Kaggle — datasets, papers, models and code stream in live,
          ranked by a transparent Reproducibility Score.
        </div>
        <div
          style={{
            marginTop: 44,
            display: "flex",
            gap: 14,
            fontSize: 19,
            color: "#f59e0b",
          }}
        >
          {PROVIDERS.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
