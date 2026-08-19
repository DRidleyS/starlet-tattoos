"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GalleryImage = {
  id: string;
  category: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

type Video = {
  id: string;
  video_url: string;
  title: string | null;
  sort_order: number;
};

type Tab = "gallery" | "flash" | "videos";

/**
 * Turns a failed response into advice. An expired sign-in is the likeliest
 * failure in a portal that gets left open for days, and it needs different
 * wording than a genuine server error.
 */
function describeFailure(status: number, fallback: string): string {
  if (status === 401 || status === 403)
    return "Your sign-in has expired. Reload the page and sign in again.";
  if (status === 413) return "That file is too large to upload.";
  return fallback;
}

export default function GalleryAdminPage() {
  const [tab, setTab] = useState<Tab>("gallery");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [imgRes, vidRes] = await Promise.all([
        fetch("/api/gallery"),
        fetch("/api/videos"),
      ]);
      if (!imgRes.ok || !vidRes.ok) {
        setError(
          describeFailure(
            imgRes.ok ? vidRes.status : imgRes.status,
            "Could not load the gallery."
          )
        );
        return;
      }
      const imgs: GalleryImage[] = await imgRes.json();
      const vids: Video[] = await vidRes.json();
      setImages(Array.isArray(imgs) ? imgs : []);
      setVideos(Array.isArray(vids) ? vids : []);
    } catch {
      // Any throw in here used to skip setLoading(false) entirely, parking the
      // page on "Loading..." forever with no explanation and no way to retry.
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredImages = images
    .filter((img) => img.category === tab)
    .sort((a, b) => a.sort_order - b.sort_order);

  const sortedVideos = [...videos].sort((a, b) => a.sort_order - b.sort_order);

  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("category", tab);
    const res = await fetch("/api/gallery", { method: "POST", body: form });
    // The response was previously discarded, so a rejected upload was
    // indistinguishable from a successful one: the refetch just came back
    // without the new image and nothing said why.
    if (!res.ok) {
      throw new Error(
        describeFailure(res.status, "The server rejected that image.")
      );
    }
  };

  const uploadVideo = async (file: File) => {
    // 1) get signed upload url
    const urlRes = await fetch("/api/videos/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    if (!urlRes.ok) throw new Error("Failed to get upload url");
    const { id, path, signedUrl, publicUrl } = (await urlRes.json()) as {
      id: string;
      path: string;
      signedUrl: string;
      publicUrl: string;
    };

    // 2) PUT file directly to Supabase using XHR for progress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signedUrl, true);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.setRequestHeader("x-upsert", "true");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });

    // 3) record row
    const insertRes = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, video_url: publicUrl, path }),
    });
    if (!insertRes.ok) throw new Error("Failed to record video");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(null);
    setError(null);
    try {
      if (tab === "videos") {
        await uploadVideo(file);
      } else {
        await uploadImage(file);
      }
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The upload failed. Please retry."
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Both deletes drop the item from the grid only after the server confirms.
  // They used to remove it unconditionally, so a failed delete looked exactly
  // like a successful one until a page refresh brought the item back.
  const handleDeleteImage = async (id: string) => {
    if (!confirm("Delete this image?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/gallery/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(describeFailure(res.status, "Could not delete that image."));
        return;
      }
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch {
      setError("Network error - the image was not deleted.");
    }
  };

  const handleDeleteVideo = async (id: string) => {
    if (!confirm("Delete this video?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(describeFailure(res.status, "Could not delete that video."));
        return;
      }
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch {
      setError("Network error - the video was not deleted.");
    }
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= filteredImages.length) return;

    const reordered = [...filteredImages];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const previous = images;
    const updatedAll = images.map((img) => {
      const idx = reordered.findIndex((r) => r.id === img.id);
      if (idx !== -1) return { ...img, sort_order: idx };
      return img;
    });
    setImages(updatedAll);
    setError(null);

    // The saved order is exactly what visitors see on the public gallery, so a
    // silently failed save left the admin grid and the live site disagreeing.
    // On failure the optimistic move is rolled back rather than left standing.
    try {
      const res = await fetch("/api/gallery/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((r) => r.id) }),
      });
      if (!res.ok) {
        setImages(previous);
        setError(describeFailure(res.status, "Could not save the new order."));
      }
    } catch {
      setImages(previous);
      setError("Network error - the new order was not saved.");
    }
  };

  const moveVideo = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sortedVideos.length) return;

    const reordered = [...sortedVideos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const previous = videos;
    setVideos(reordered.map((v, i) => ({ ...v, sort_order: i })));
    setError(null);

    try {
      const res = await fetch("/api/videos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((r) => r.id) }),
      });
      if (!res.ok) {
        setVideos(previous);
        setError(describeFailure(res.status, "Could not save the new order."));
      }
    } catch {
      setVideos(previous);
      setError("Network error - the new order was not saved.");
    }
  };

  const uploadLabel = uploading
    ? uploadProgress !== null
      ? `Uploading ${uploadProgress}%`
      : "Uploading..."
    : tab === "videos"
    ? "Upload Video"
    : "Upload Image";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gallery Management</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["gallery", "flash", "videos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t
                ? "bg-rose-500 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {t === "gallery"
              ? "Gallery"
              : t === "flash"
              ? "Flash Designs"
              : "Videos"}
          </button>
        ))}
      </div>

      {/* Upload */}
      <div className="mb-6">
        <label className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg cursor-pointer transition text-sm font-medium">
          {uploadLabel}
          <input
            ref={fileRef}
            type="file"
            accept={tab === "videos" ? "video/*" : "image/*"}
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Every failure path above lands here instead of vanishing or firing an
          alert(). role=alert announces it; the retry re-runs the fetch that
          previously had no way back once it failed. */}
      {error && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center gap-3 bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg px-4 py-3"
        >
          <span>{error}</span>
          <button
            onClick={fetchAll}
            className="underline hover:text-red-200 transition"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : tab === "videos" ? (
        sortedVideos.length === 0 ? (
          <p className="text-neutral-500">No videos yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {sortedVideos.map((v, i) => (
              <div
                key={v.id}
                className="bg-neutral-900 rounded-lg overflow-hidden group relative"
              >
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={v.video_url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-40 object-cover bg-black"
                />
                <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition flex items-center justify-center gap-2">
                  <button
                    onClick={() => moveVideo(i, -1)}
                    disabled={i === 0}
                    className="bg-neutral-700 hover:bg-neutral-600 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg disabled:opacity-30 text-sm"
                    title="Move left"
                  >
                    &larr;
                  </button>
                  <button
                    onClick={() => moveVideo(i, 1)}
                    disabled={i === sortedVideos.length - 1}
                    className="bg-neutral-700 hover:bg-neutral-600 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg disabled:opacity-30 text-sm"
                    title="Move right"
                  >
                    &rarr;
                  </button>
                  <button
                    onClick={() => handleDeleteVideo(v.id)}
                    className="bg-red-600 hover:bg-red-700 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg text-sm"
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
        )
      ) : filteredImages.length === 0 ? (
        <p className="text-neutral-500">
          No {tab === "gallery" ? "gallery" : "flash"} images yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredImages.map((img, i) => (
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
              <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button
                  onClick={() => moveImage(i, -1)}
                  disabled={i === 0}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg disabled:opacity-30 text-sm"
                  title="Move left"
                >
                  &larr;
                </button>
                <button
                  onClick={() => moveImage(i, 1)}
                  disabled={i === filteredImages.length - 1}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg disabled:opacity-30 text-sm"
                  title="Move right"
                >
                  &rarr;
                </button>
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-9 h-9 md:w-8 md:h-8 rounded-lg text-sm"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-neutral-500 p-2 truncate">#{i + 1}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
