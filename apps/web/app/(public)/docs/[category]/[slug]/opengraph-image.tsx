import { ImageResponse } from "next/og";
import { registry } from "../../../../../lib/docs/registry";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { category: string; slug: string };
}) {
  const cat = registry.find((c) => c.slug === params.category);
  const art = cat?.articles.find((a) => a.slug === params.slug);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a1628 0%, #0d2137 100%)",
          padding: "60px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
          <div
            style={{
              background: "#0BBF77",
              color: "white",
              padding: "8px 18px",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            WBMSG
          </div>
          <div style={{ color: "#6b7280", fontSize: "14px" }}>Help Center</div>
          {cat && (
            <>
              <div style={{ color: "#374151", fontSize: "14px" }}>›</div>
              <div
                style={{
                  background: cat.bgHex,
                  color: cat.colorHex,
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                {cat.icon} {cat.title}
              </div>
            </>
          )}
        </div>

        {/* Article title */}
        <div
          style={{
            fontSize: "52px",
            fontWeight: 800,
            color: "white",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {art?.title ?? "Help Center"}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: "20px",
            color: "#9ca3af",
            lineHeight: 1.5,
            marginTop: "24px",
            maxWidth: "800px",
          }}
        >
          {art?.description ?? "Learn how to use WBMSG"}
        </div>

        {/* Bottom domain */}
        <div style={{ marginTop: "40px", color: "#4b5563", fontSize: "14px" }}>
          wbmsg.com/docs
        </div>
      </div>
    ),
    { ...size }
  );
}
