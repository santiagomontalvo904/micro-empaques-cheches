import type { NextConfig } from "next";

const config: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "page", value: "planeacion" }],
        destination: "/planeacion",
        permanent: false,
      },
      { source: "/index.html", destination: "/", permanent: false },
    ];
  },
};

export default config;
