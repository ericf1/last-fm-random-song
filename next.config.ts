import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lastfm.freetls.fastly.net",
        pathname: "/i/u/**", // covers all Last.fm image sizes
      },
      {
        protocol: "https",
        hostname: "last.fm",
        pathname: "/**", // sometimes smaller thumbnails come from main domain
      },
    ],
  },
};

export default nextConfig;
