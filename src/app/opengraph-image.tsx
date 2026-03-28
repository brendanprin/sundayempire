import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(45deg, #0F172A 0%, #1e293b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "40px",
          }}
        >
          {/* Brand Badge */}
          <div
            style={{
              width: "120px",
              height: "120px",
              backgroundColor: "#C9A227",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                backgroundColor: "#F5F1E8",
                borderRadius: "50%",
              }}
            />
          </div>

          {/* Brand Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <h1
              style={{
                fontSize: "80px",
                fontWeight: "700",
                color: "#F5F1E8",
                margin: "0",
                lineHeight: "1",
              }}
            >
              SundayEmpire
            </h1>
            <p
              style={{
                fontSize: "32px",
                color: "#C9A227",
                margin: "8px 0 0 0",
                fontWeight: "400",
              }}
            >
              Dynasty League Tool
            </p>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}