import { ImageResponse } from "next/og";

/** The app icon: a blue square with "Wb", drawn as a PNG at any size. */
export function iconResponse(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2346C8",
          color: "#FFFFFF",
          fontSize: size * 0.42,
          fontWeight: 700,
          letterSpacing: -size * 0.02,
        }}
      >
        Wb
      </div>
    ),
    { width: size, height: size },
  );
}
