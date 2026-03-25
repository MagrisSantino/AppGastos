import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Control de Gastos",
    short_name: "Gastos",
    description:
      "Control de gastos personales. Datos almacenados en tu navegador.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
