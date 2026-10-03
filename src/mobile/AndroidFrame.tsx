// AndroidFrame.tsx — a lightweight Android device bezel for the desktop
// preview (status bar + gesture nav). On a real phone the app fills the
// viewport and this frame isn't rendered.

import type { ComponentChildren } from "preact";

function StatusBar({ dark }: { dark: boolean }) {
  const c = dark ? "#fff" : "#171d1b";
  return (
    <div
      style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        position: "relative",
        flexShrink: 0,
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        background: "transparent",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2, color: c }}>9:30</span>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 8,
          transform: "translateX(-50%)",
          width: 9,
          height: 9,
          borderRadius: 100,
          background: dark ? "#0a0a0a" : "#2b2926",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {/* signal */}
        <svg width="15" height="11" viewBox="0 0 15 11">
          <rect x="0" y="7" width="2.5" height="4" rx="0.5" fill={c} />
          <rect x="4" y="4.5" width="2.5" height="6.5" rx="0.5" fill={c} />
          <rect x="8" y="2" width="2.5" height="9" rx="0.5" fill={c} />
          <rect x="12" y="0" width="2.5" height="11" rx="0.5" fill={c} opacity="0.4" />
        </svg>
        {/* wifi */}
        <svg width="14" height="11" viewBox="0 0 16 12">
          <path d="M8 11.5L1 4.5a10 10 0 0114 0L8 11.5z" fill={c} />
        </svg>
        {/* battery */}
        <svg width="22" height="12" viewBox="0 0 22 12">
          <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" fill="none" stroke={c} opacity="0.5" />
          <rect x="2" y="2" width="13" height="8" rx="1.2" fill={c} />
          <rect x="19.5" y="3.5" width="1.6" height="5" rx="0.8" fill={c} opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

export function AndroidFrame({
  children,
  width = 412,
  height = 892,
  dark = false,
}: {
  children: ComponentChildren;
  width?: number;
  height?: number;
  dark?: boolean;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 44,
        overflow: "hidden",
        background: dark ? "#1c1b18" : "#f7f4ec",
        border: "9px solid #0b0b0b",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <StatusBar dark={dark} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ width: 120, height: 4, borderRadius: 2, background: dark ? "#fff" : "#171d1b", opacity: 0.35 }} />
      </div>
    </div>
  );
}
