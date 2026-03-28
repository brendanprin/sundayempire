import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          backgroundColor: "#0F172A",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "32px",
        }}
      >
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
      </div>
    ),
    {
      ...size,
    }
  );
}