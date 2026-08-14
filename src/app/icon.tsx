import { ImageResponse } from "next/og";
import { CairnMark } from "./cairn-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 64,
        }}
      >
        <CairnMark size={220} stroke="#f59e0b" strokeWidth={2} />
      </div>
    ),
    size,
  );
}
