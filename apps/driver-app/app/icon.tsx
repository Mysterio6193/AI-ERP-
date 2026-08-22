import { ImageResponse } from "next/og"

export const size = {
  width: 512,
  height: 512,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #020617, #0f172a 48%, #115e59 130%)",
          color: "white",
          fontFamily: "SF Pro Display, sans-serif",
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "18px solid rgba(255,255,255,0.14)",
            background: "linear-gradient(145deg, #14b8a6, #2563eb)",
            fontSize: 152,
            fontWeight: 800,
          }}
        >
          D
        </div>
      </div>
    ),
    size
  )
}
