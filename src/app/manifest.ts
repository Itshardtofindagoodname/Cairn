import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#f59e0b",
    icons: [
      {
        src: "/cairn_logo.png",
        sizes: "1254x1254",
        type: "image/png",
      },
      {
        src: "/cairn_ico.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
