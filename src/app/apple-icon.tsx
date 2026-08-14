import { ImageResponse } from "next/og";
import { CairnMark } from "./cairn-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          borderRadius: 40,
        }}
      >
        <CairnMark size={96} stroke="#f59e0b" strokeWidth={2} />
      </div>
    ),
    size,
  );
}
