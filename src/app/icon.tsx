import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#faf8f4",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px",
          border: "1.5px solid #dbd3c5",
          position: "relative",
        }}
      >
        {/* Simplified Orange Arc Logo */}
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: "4px solid #a1461c",
            borderRightColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        />
        {/* Orange Dot */}
        <div
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            backgroundColor: "#a1461c",
            position: "absolute",
            right: "4px",
            top: "14px",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
