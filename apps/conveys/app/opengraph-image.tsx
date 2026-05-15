import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Conveys Information Technology — Website Development, Mobile Apps & AI Solutions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "72px 80px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            right: "60px",
            top: "40px",
            width: "480px",
            height: "480px",
            background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "20px",
            bottom: "-60px",
            width: "360px",
            height: "360px",
            background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "36px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "14px",
              boxShadow: "0 0 30px rgba(59,130,246,0.5)",
            }}
          >
            <div style={{ color: "white", fontSize: "26px", fontWeight: "800", lineHeight: 1 }}>C</div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: "18px", fontWeight: "600", letterSpacing: "0.02em" }}>
            Conveys Information Technology
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            color: "white",
            fontSize: "58px",
            fontWeight: "800",
            lineHeight: "1.1",
            maxWidth: "820px",
            marginBottom: "20px",
            letterSpacing: "-0.02em",
          }}
        >
          We Build Digital Products That Move Businesses Forward
        </div>

        {/* Subtitle */}
        <div
          style={{
            color: "#94a3b8",
            fontSize: "22px",
            maxWidth: "680px",
            marginBottom: "44px",
            lineHeight: "1.5",
          }}
        >
          Web Development · Mobile Apps · WhatsApp CRM · AI Solutions
        </div>

        {/* Pill badges */}
        <div style={{ display: "flex", gap: "12px" }}>
          {["Mumbai, India", "50+ Projects", "100+ Clients"].map((label) => (
            <div
              key={label}
              style={{
                background: "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.3)",
                color: "#93c5fd",
                padding: "8px 20px",
                borderRadius: "100px",
                fontSize: "15px",
                fontWeight: "600",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Domain badge bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: "48px",
            right: "80px",
            background: "#3b82f6",
            color: "white",
            padding: "10px 28px",
            borderRadius: "100px",
            fontSize: "16px",
            fontWeight: "700",
            letterSpacing: "0.02em",
          }}
        >
          conveys.in
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
