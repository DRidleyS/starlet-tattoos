"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GalleryImage = {
  id: string;
  category: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

export default function GalleryAdminPage() {
  const [tab, setTab] = useState<"gallery" | "flash">("gallery");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/gallery");
    const all: GalleryImage[] = await res.json();
    setImages(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const filtered = images
    .filter((img) => img.category === tab)
    .sort((a, b) => a.sort_order - b.sort_order);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("category", tab);
    await fetch("/api/gallery", { method: "POST", body: form });
    await fetchImages();
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this image?")) return;
    await fetch(`/api/gallery/${id}`, { method: "DELETE" });
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= filtered.length) return;

    const reordered = [...filtered];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    // Optimistic update
    const updatedAll = images.map((img) => {
      const idx = reordered.findIndex((r) => r.id === img.id);
      if (idx !== -1) return { ...img, sort_order: idx };
      return img;
    });
    setImages(updatedAll);

    await fetch("/api/gallery/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((r) => r.id) }),
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gallery Management</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["gallery", "flash"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t
                ? "bg-rose-500 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {t === "gallery" ? "Gallery" : "Flash Designs"}
          </button>
        ))}
      </div>

      {/* Upload */}
      <div className="mb-6">
        <label className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg cursor-pointer transition text-sm font-medium">
          {uploading ? "Uploading..." : "Upload Image"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">
          No {tab === "gallery" ? "gallery" : "flash"} images yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((img, i) => (
            <div
              key={img.id}
              className="bg-neutral-900 rounded-lg overflow-hidden group relative"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.image_url}
                alt={img.alt_text || ""}
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button
                  onClick={() => moveImage(i, -1)}
                  disabled={i === 0}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white w-8 h-8 rounded-lg disabled:opacity-30 text-sm"
                  title="Move left"
                >
                  &larr;
                </button>
                <button
                  onClick={() => moveImage(i, 1)}
                  disabled={i === filtered.length - 1}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white w-8 h-8 rounded-lg disabled:opacity-30 text-sm"
                  title="Move right"
                >
                  &rarr;
                </button>
                <button
                  onClick={() => handleDelete(img.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-lg text-sm"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-neutral-500 p-2 truncate">
                #{i + 1}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
