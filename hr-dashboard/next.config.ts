import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

type SecurityHeader = {
  key: string;
  value: string;
};

export function buildContentSecurityPolicy(isProductionEnvironment: boolean): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'" + (isProductionEnvironment ? "" : " 'unsafe-eval'"),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
  ];

  if (isProductionEnvironment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function buildSecurityHeaders(isProductionEnvironment: boolean): SecurityHeader[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isProductionEnvironment),
    },
    ...(isProductionEnvironment
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ]
      : []),
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(isProduction),
      },
    ];
  },
};

export default nextConfig;
