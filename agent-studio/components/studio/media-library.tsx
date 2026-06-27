"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Shared media library ("asset bin"). Every clip the user brings in — uploaded,
 * by URL, a sample, or AI-generated — is registered here so it shows in the Assets
 * panel and can be re-added or removed independent of the timeline. In-memory and
 * session-scoped (blob URLs don't survive a reload), which matches how the editor
 * holds project state today.
 */

export type AssetType = "video" | "image" | "audio";
export type AssetOrigin = "upload" | "url" | "sample" | "generated";

export interface MediaAsset {
  id: string;
  name: string;
  src: string;
  type: AssetType;
  origin: AssetOrigin;
}

interface MediaLibraryValue {
  assets: MediaAsset[];
  /** Register an asset; de-duplicates by src and returns the (existing or new) entry. */
  addAsset: (asset: Omit<MediaAsset, "id">) => MediaAsset;
  removeAsset: (id: string) => void;
}

const MediaLibraryContext = createContext<MediaLibraryValue | null>(null);

let counter = 0;
const nextId = (): string => `asset-${++counter}-${Math.round(performance.now())}`;

export function MediaLibraryProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  const addAsset = useCallback((asset: Omit<MediaAsset, "id">): MediaAsset => {
    const existing = assets.find((a) => a.src === asset.src);
    if (existing) return existing;
    const created: MediaAsset = { ...asset, id: nextId() };
    setAssets((prev) => (prev.some((a) => a.src === asset.src) ? prev : [created, ...prev]));
    return created;
  }, [assets]);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <MediaLibraryContext.Provider value={{ assets, addAsset, removeAsset }}>
      {children}
    </MediaLibraryContext.Provider>
  );
}

/** Returns the library, or a no-op fallback if used outside the provider. */
export function useMediaLibrary(): MediaLibraryValue {
  const ctx = useContext(MediaLibraryContext);
  if (ctx) return ctx;
  return { assets: [], addAsset: (a) => ({ ...a, id: "noop" }), removeAsset: () => {} };
}
