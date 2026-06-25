"use client";

import dynamic from "next/dynamic";

// TwickStudio is browser-only (WebCodecs, fabric.js, window access), so the
// whole shell is rendered client-side with SSR disabled.
const StudioShell = dynamic(() => import("@/components/studio-shell"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "#888", background: "#0f0f14", fontFamily: "system-ui" }}>
      Loading studio…
    </div>
  ),
});

export default function Page() {
  return <StudioShell />;
}
