"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import SignaturePad from "signature_pad";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { useRouter } from "next/navigation";

const ACCENT = "#b76e79";

type DrawingPadHandle = {
  save: () => string | null;
  reset: () => void;
  isEmpty: () => boolean;
};

function BouncyButton({
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [bouncing, setBouncing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    // restart animation even on rapid clicks
    setBouncing(false);
    requestAnimationFrame(() => {
      setBouncing(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setBouncing(false), 280);
    });
    onClick?.(e);
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      className={
        "btn-bounce " +
        (bouncing ? "is-bouncing " : "") +
        (className ? className : "")
      }
    />
  );
}

function AnimatedQuestion({ text }: { text: string }) {
  const charsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const els = charsRef.current.filter(Boolean) as HTMLSpanElement[];
    if (!els.length) return;

    gsap.killTweensOf(els);
    gsap.set(els, { opacity: 0, y: 18, rotate: -2, filter: "blur(6px)" });
    gsap.to(els, {
      opacity: 1,
      y: 0,
      rotate: 0,
      filter: "blur(0px)",
      duration: 0.55,
      ease: "power3.out",
      stagger: 0.015,
    });
  }, [text]);

  // preserve spaces in animation
  const chars = Array.from(text);
  return (
    <h2
      className="font-title text-black leading-[0.95] tracking-tight text-center"
      style={{ fontSize: "clamp(2.4rem, 7vw, 5.2rem)" }}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          ref={(el) => {
            charsRef.current[i] = el;
          }}
          style={{
            display: "inline-block",
            whiteSpace: ch === " " ? "pre" : "normal",
          }}
        >
          {ch}
        </span>
      ))}
    </h2>
  );
}

type FunnelData = {
  fullName: string;
  email: string;
  phone: string;
  tattooDescription: string;

  referencePhotos: File[];

  dob: string;
  photoId: File | null;

  initialsPngDataUrl: string | null;
  signaturePngDataUrl: string | null;

  consentDate: string;
};

const STORAGE_KEY = "starlet_booking_funnel_v1";

const MAX_REFERENCE_PHOTOS = 3;
const MAX_REFERENCE_PHOTO_BYTES = 1_800_000; // ~1.8MB each

// EmailJS has a small total attachment limit (often 500KB). We budget slightly
// under to account for overhead/variance.
const MAX_TOTAL_ATTACHMENTS_BYTES = 480_000;

const CONSENT_ITEMS: Array<{ key: string; text: string }> = [
  {
    key: "notUnderInfluence",
    text: "I am not under the influence of drugs or alcohol.",
  },
  { key: "notPregnant", text: "I am not pregnant." },
  {
    key: "noCommunicableDisease",
    text: "I acknowledge I am free of communicable disease.",
  },
  {
    key: "over18",
    text: "I am over the age of 18 (legal age of consent in California).",
  },
  {
    key: "noIrritatedSkin",
    text: "I do not have acne, freckles, moles, or sunburn in the area to be tattooed.",
  },
  {
    key: "designApproved",
    text: "I understand and have viewed my design and give consent.",
  },
  {
    key: "allergiesDisclosed",
    text: "I acknowledge that I have truthfully represented any existing allergies.",
  },
  {
    key: "infectionRiskUnderstood",
    text: "I acknowledge infection risk and aftercare instructions.",
  },
  {
    key: "permanentChangeUnderstood",
    text: "I understand obtaining a tattoo is a permanent change.",
  },
  {
    key: "choiceAndConsent",
    text: "I acknowledge this is my choice and I consent to the tattoo.",
  },
  {
    key: "inksNotFdaApproved",
    text: "I acknowledge inks/dyes are not FDA approved.",
  },
  {
    key: "lightheadedRiskUnderstood",
    text: "I acknowledge the chance of feeling lightheaded or dizzy.",
  },
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function digitsOnly(value: string) {
  return (value || "").replace(/\D+/g, "");
}

function formatUsPhone(value: string) {
  const digits = digitsOnly(value).slice(0, 10);
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 10);

  if (!digits) return "";
  if (digits.length < 4) return `(${a}`;
  if (digits.length < 7) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const w = canvas.offsetWidth || 300;
  const h = canvas.offsetHeight || 100;
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (typeof ctx.setTransform === "function")
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
  }
}

function drawDataUrlToCanvas(
  canvas: HTMLCanvasElement,
  dataUrl: string,
  opts?: { clear?: boolean },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  img.onload = () => {
    try {
      if (opts?.clear !== false) {
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      }
      ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
    } catch {
      // ignore
    }
  };
  img.src = dataUrl;
}

const InitialsPad = React.forwardRef<
  DrawingPadHandle,
  {
    value: string | null;
    onChange: (dataUrl: string | null) => void;
  }
>(function InitialsPad({ value, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    try {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return false;
      }
      return true;
    } catch {
      return !value;
    }
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      if (isEmpty()) return null;
      const dataUrl = canvas.toDataURL("image/png");
      onChangeRef.current(dataUrl);
      return dataUrl;
    } catch {
      // ignore
      return null;
    }
  };

  const reset = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      } catch {
        // ignore
      }
    }
    onChangeRef.current(null);
  };

  React.useImperativeHandle(ref, () => ({ save, reset, isEmpty }), [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.touchAction = "none";
    resizeCanvasToDisplaySize(canvas);

    if (value) drawDataUrlToCanvas(canvas, value);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
    }

    const getPos = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      drawingRef.current = true;
      lastRef.current = getPos(ev);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      ev.preventDefault();
      const ctx2 = canvas.getContext("2d");
      if (!ctx2) return;
      const p = getPos(ev);
      const prev = lastRef.current;
      if (prev) {
        ctx2.beginPath();
        ctx2.moveTo(prev.x, prev.y);
        ctx2.lineTo(p.x, p.y);
        ctx2.stroke();
      }
      lastRef.current = p;
    };

    const finish = (ev?: PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastRef.current = null;
      try {
        if (ev) canvas.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      save();
    };

    const onResize = () => {
      const prev = value;
      resizeCanvasToDisplaySize(canvas);
      if (prev) drawDataUrlToCanvas(canvas, prev);
    };

    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);

    return () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", finish);
    };
  }, [value]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="w-60 h-16 border border-black/15 rounded-2xl bg-white"
      />
      <div className="mt-3 flex">
        <BouncyButton
          type="button"
          className="px-5 py-2 rounded-full border border-black/15 text-sm hover:bg-black/5"
          onClick={reset}
        >
          Reset
        </BouncyButton>
      </div>
    </div>
  );
});

const SignaturePadCanvas = React.forwardRef<
  DrawingPadHandle,
  {
    value: string | null;
    onChange: (dataUrl: string | null) => void;
  }
>(function SignaturePadCanvas({ value, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isEmpty = () => {
    const pad = padRef.current;
    if (!pad) return true;
    try {
      return pad.isEmpty();
    } catch {
      return !value;
    }
  };

  const save = () => {
    const pad = padRef.current;
    if (!pad) return null;
    try {
      if (pad.isEmpty()) return null;
      const dataUrl = pad.toDataURL("image/png");
      onChangeRef.current(dataUrl);
      return dataUrl;
    } catch {
      // ignore
      return null;
    }
  };

  const reset = () => {
    try {
      padRef.current?.clear();
    } catch {
      // ignore
    }
    onChangeRef.current(null);
  };

  React.useImperativeHandle(ref, () => ({ save, reset, isEmpty }), [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.touchAction = "none";
    resizeCanvasToDisplaySize(canvas);

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#000000",
      minWidth: 1,
      maxWidth: 2.5,
    });
    padRef.current = pad;

    // Some browsers/devices are flaky with signature-pad's onEnd; keep it,
    // but also provide an explicit Save button.
    (pad as any).onEnd = () => save();

    if (value) {
      try {
        (pad as any).fromDataURL?.(value);
      } catch {
        // ignore
      }
    }

    const onResize = () => {
      const saved = !pad.isEmpty() ? pad.toDataURL("image/png") : value;
      resizeCanvasToDisplaySize(canvas);
      pad.clear();
      if (saved) {
        try {
          (pad as any).fromDataURL?.(saved);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      padRef.current = null;
    };
  }, [value]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full h-40 border border-black/15 rounded-2xl bg-white"
      />
      <div className="mt-3 flex">
        <BouncyButton
          type="button"
          className="px-5 py-2 rounded-full border border-black/15 text-sm hover:bg-black/5"
          onClick={reset}
        >
          Reset
        </BouncyButton>
      </div>
    </div>
  );
});

function toSingleLine(value: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function ConsentChecklist({ initialsMark }: { initialsMark: string | null }) {
  return (
    <div className="mt-4 grid gap-3">
      {CONSENT_ITEMS.map((item) => (
        <div key={item.key} className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-block w-6 h-6 rounded-sm border border-black/80 shrink-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: initialsMark ? `url(${initialsMark})` : "none",
              backgroundSize: "contain",
            }}
          />
          <p className="text-sm text-black/90 leading-snug">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

async function buildConsentPdf(data: FunnelData) {
  try {
    // Prefer a boilerplate PDF if you provide one in /public.
    // If it's missing, generate a clean consent summary PDF.
    let pdfDoc: PDFDocument;
    let page;
    try {
      const tplRes = await fetch("/consent_boilerplate.pdf");
      if (!tplRes.ok) throw new Error("missing template");
      const tplBytes = await tplRes.arrayBuffer();

      // If a heavy template is provided, it can easily exceed EmailJS attachment
      // limits. Fall back to a clean generated PDF instead.
      if (tplBytes.byteLength > 250_000) throw new Error("template too large");

      pdfDoc = await PDFDocument.load(tplBytes);
      page = pdfDoc.getPages()[0];
    } catch {
      pdfDoc = await PDFDocument.create();
      page = pdfDoc.addPage([612, 792]); // US Letter
    }

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const safe = (s: string) => (s || "").replace(/[\r\n]+/g, " ").trim();

    // Header
    try {
      page.drawText("Tattoo Consent Summary", {
        x: 50,
        y: 750,
        size: 16,
        font: helv,
        color: rgb(0, 0, 0),
      });
      page.drawText(`Consent date: ${safe(data.consentDate)}`, {
        x: 50,
        y: 732,
        size: 11,
        font: helv,
        color: rgb(0, 0, 0),
      });
    } catch {
      // ignore
    }

    // Contact details
    page.drawText(`Name: ${safe(data.fullName)}`, {
      x: 50,
      y: 700,
      size: 11,
      font: helv,
      color: rgb(0, 0, 0),
    });
    page.drawText(`DOB: ${safe(data.dob)}`, {
      x: 50,
      y: 682,
      size: 11,
      font: helv,
      color: rgb(0, 0, 0),
    });
    page.drawText(`Email: ${safe(data.email)}`, {
      x: 50,
      y: 664,
      size: 11,
      font: helv,
      color: rgb(0, 0, 0),
    });
    page.drawText(`Phone: ${safe(data.phone)}`, {
      x: 50,
      y: 646,
      size: 11,
      font: helv,
      color: rgb(0, 0, 0),
    });

    // Consent checklist summary
    try {
      page.drawText("Acknowledgements:", {
        x: 50,
        y: 600,
        size: 12,
        font: helv,
        color: rgb(0, 0, 0),
      });

      let y = 582;
      for (const item of CONSENT_ITEMS) {
        page.drawText(`• ${safe(item.text)}`, {
          x: 60,
          y,
          size: 9.5,
          font: helv,
          color: rgb(0, 0, 0),
        });
        y -= 14;
        if (y < 240) break;
      }
    } catch {
      // ignore
    }

    // Initials and signature images
    if (data.initialsPngDataUrl) {
      try {
        const jpgBytes = await compressDataUrlToJpegBytes(
          data.initialsPngDataUrl,
          {
            maxBytes: 35_000,
            maxDimension: 520,
            initialQuality: 0.78,
          },
        );
        const img = await pdfDoc.embedJpg(jpgBytes);
        page.drawText("Initials:", {
          x: 50,
          y: 210,
          size: 11,
          font: helv,
          color: rgb(0, 0, 0),
        });
        page.drawImage(img, { x: 110, y: 198, width: 80, height: 22 });
      } catch {
        // ignore
      }
    }

    if (data.signaturePngDataUrl) {
      try {
        const jpgBytes = await compressDataUrlToJpegBytes(
          data.signaturePngDataUrl,
          {
            maxBytes: 70_000,
            maxDimension: 1400,
            initialQuality: 0.78,
          },
        );
        const sigImg = await pdfDoc.embedJpg(jpgBytes);
        page.drawText("Signature:", {
          x: 50,
          y: 160,
          size: 11,
          font: helv,
          color: rgb(0, 0, 0),
        });
        page.drawImage(sigImg, { x: 120, y: 120, width: 220, height: 70 });
      } catch {
        // ignore
      }
    }

    const pdfBytes = await pdfDoc.save();

    const uint8ToBase64 = (u8: Uint8Array) => {
      let binary = "";
      for (let i = 0; i < u8.byteLength; i++)
        binary += String.fromCharCode(u8[i]);
      return btoa(binary);
    };

    const base64 = uint8ToBase64(new Uint8Array(pdfBytes));
    return {
      attachment: `data:application/pdf;base64,${base64}`,
      attachment_name: `${(data.fullName || "consent").replace(/\s+/g, "_")}_consent_form.pdf`,
    };
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === "string") resolve(res);
      else reject(new Error("Unexpected FileReader result"));
    };
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl: string) {
  const idx = (dataUrl || "").indexOf(",");
  if (idx === -1) return 0;
  const base64 = dataUrl.slice(idx + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  // base64 length is ~4/3 of bytes
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function withJpegExtension(fileName: string) {
  const safe = fileName || "image";
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  return `${base}.jpg`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Failed to encode image"));
        else resolve(b);
      },
      type,
      quality,
    );
  });
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });
    return img;
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

async function compressImageBlobToJpegBlob(
  input: Blob,
  opts: {
    maxBytes: number;
    maxDimension: number;
    initialQuality?: number;
    minQuality?: number;
  },
): Promise<Blob> {
  const img = await loadImageFromBlob(input);

  const initialQuality = opts.initialQuality ?? 0.82;
  const minQuality = opts.minQuality ?? 0.5;

  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);

  let scale = 1;
  const maxDim = Math.max(srcW, srcH);
  if (maxDim > opts.maxDimension) scale = opts.maxDimension / maxDim;

  for (let pass = 0; pass < 6; pass++) {
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, w, h);

    let q = initialQuality;
    for (let i = 0; i < 8; i++) {
      const out = await canvasToBlob(canvas, "image/jpeg", q);
      if (out.size <= opts.maxBytes) return out;
      if (q <= minQuality) break;
      q = Math.max(minQuality, q * 0.86);
    }

    scale *= 0.85;
  }

  // Last resort: return the smallest we could get at low quality.
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, "image/jpeg", minQuality);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === "string") resolve(res);
      else reject(new Error("Unexpected FileReader result"));
    };
    reader.readAsDataURL(blob);
  });
}

async function compressImageFileToJpegDataUrl(
  file: File,
  opts: {
    maxBytes: number;
    maxDimension: number;
    initialQuality?: number;
    minQuality?: number;
  },
): Promise<{ dataUrl: string; fileName: string; byteSize: number }> {
  const outBlob = await compressImageBlobToJpegBlob(file, opts);
  const dataUrl = await blobToDataUrl(outBlob);
  return {
    dataUrl,
    fileName: withJpegExtension(file.name),
    byteSize: outBlob.size,
  };
}

async function compressDataUrlToJpegBytes(
  dataUrl: string,
  opts: {
    maxBytes: number;
    maxDimension: number;
    initialQuality?: number;
    minQuality?: number;
  },
): Promise<Uint8Array> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const outBlob = await compressImageBlobToJpegBlob(blob, opts);
  const buf = await outBlob.arrayBuffer();
  return new Uint8Array(buf);
}

export default function BookingFunnel() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<
    string | null
  >(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const [data, setData] = useState<FunnelData>({
    fullName: "",
    email: "",
    phone: "",
    tattooDescription: "",
    referencePhotos: [],
    dob: "",
    photoId: null,
    initialsPngDataUrl: null,
    signaturePngDataUrl: null,
    consentDate: todayISO(),
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  // hydrate from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setData((prev) => ({
        ...prev,
        ...parsed,
        photoId: null, // can't restore files
        referencePhotos: [], // can't restore files
      }));
    } catch {
      // ignore
    }
  }, []);

  // persist (minus the file)
  useEffect(() => {
    try {
      const { photoId: _file, referencePhotos: _refs, ...serializable } = data;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }, [data]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setStepError(null);
  }, [step]);

  const initialsPadRef = useRef<DrawingPadHandle | null>(null);
  const signaturePadRef = useRef<DrawingPadHandle | null>(null);

  const steps = useMemo(() => {
    return [
      {
        id: "fullName",
        title: "What’s your full name?",
        canNext: data.fullName.trim().length >= 2,
      },
      {
        id: "email",
        title: "What’s your email?",
        canNext: isValidEmail(data.email.trim()),
      },
      {
        id: "phone",
        title: "What’s your phone number?",
        canNext: digitsOnly(data.phone).length === 10,
      },
      {
        id: "tattooDescription",
        title: "Tell us about your tattoo",
        canNext: data.tattooDescription.trim().length >= 10,
      },
      {
        id: "referencePhotos",
        title: "Add reference photos (optional)",
        canNext: true,
      },
      { id: "dob", title: "Date of birth", canNext: Boolean(data.dob) },
      {
        id: "photoId",
        title: "Upload photo ID",
        canNext: Boolean(data.photoId),
      },
      {
        id: "consentInitials",
        title: "Consent initials",
        canNext: true,
      },
      {
        id: "signature",
        title: "Draw your signature",
        canNext: true,
      },
      {
        id: "consentDate",
        title: "Consent date",
        canNext: Boolean(data.consentDate),
      },
      { id: "review", title: "Review & submit", canNext: true },
    ] as const;
  }, [data]);

  const totalSteps = steps.length;
  const current = steps[step];

  const resetFunnel = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    setStep(0);
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitSuccessMessage(null);
    setData({
      fullName: "",
      email: "",
      phone: "",
      tattooDescription: "",
      referencePhotos: [],
      dob: "",
      photoId: null,
      initialsPngDataUrl: null,
      signaturePngDataUrl: null,
      consentDate: todayISO(),
    });
  };

  const goNext = () => {
    if (current.id === "consentInitials") {
      const saved = initialsPadRef.current?.save?.() ?? null;
      if (saved) {
        setData((d) => ({ ...d, initialsPngDataUrl: saved }));
        setStepError(null);
      } else {
        setStepError("Please draw your initials to continue.");
        return;
      }
    }

    if (current.id === "signature") {
      const saved = signaturePadRef.current?.save?.() ?? null;
      if (saved) {
        setData((d) => ({ ...d, signaturePngDataUrl: saved }));
        setStepError(null);
      } else {
        setStepError("Please draw your signature to continue.");
        return;
      }
    }

    if (!current.canNext) return;
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (submitting) return;
    if (submitSuccess) return;
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitSuccessMessage(null);
    setSubmitting(true);
    try {
      const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
      const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
      const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

      if (!serviceId || !templateId || !publicKey) {
        throw new Error(
          "Email service is not configured. Please try again later.",
        );
      }

      const payload: Record<string, any> = {
        from_name: data.fullName,
        reply_to: data.email,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        tattooDescription: data.tattooDescription,
        referencePhotos_count: "0",
        dob: data.dob,
        photoId_name: data.photoId?.name || "",
        consentDate: data.consentDate,
      };

      // Attach uploaded Photo ID (EmailJS template must define a Variable Attachment
      // whose parameter name is `photo_id`).
      if (data.photoId) {
        const MAX = 6_000_000; // avoid huge client-side work
        if (data.photoId.size > MAX) {
          throw new Error(
            "Photo ID file is too large. Please upload a smaller image (under ~2MB).",
          );
        }

        const compressed = await compressImageFileToJpegDataUrl(data.photoId, {
          maxBytes: 120_000,
          maxDimension: 1600,
          initialQuality: 0.82,
          minQuality: 0.52,
        });
        payload.photo_id = compressed.dataUrl;
        payload.photo_id_name = compressed.fileName;
      }

      // Attach up to 3 reference photos.
      // EmailJS template must define Variable Attachments with parameter names:
      // `reference_1`, `reference_2`, `reference_3`.
      const refs = (data.referencePhotos || []).slice(0, MAX_REFERENCE_PHOTOS);
      const compressedRefs: Array<{ dataUrl: string; fileName: string }> = [];
      for (let i = 0; i < refs.length; i++) {
        const f = refs[i];
        if (f.size > MAX_REFERENCE_PHOTO_BYTES) {
          throw new Error(
            `Reference photo ${i + 1} is too large. Please upload images under ~2MB each.`,
          );
        }
        const compressed = await compressImageFileToJpegDataUrl(f, {
          maxBytes: 80_000,
          maxDimension: 1400,
          initialQuality: 0.82,
          minQuality: 0.52,
        });
        compressedRefs.push({
          dataUrl: compressed.dataUrl,
          fileName: compressed.fileName,
        });
      }

      const pdf = await buildConsentPdf(data);
      if (pdf) {
        payload.attachment = pdf.attachment;
        payload.attachment_name = pdf.attachment_name;
      }

      // Ensure we fit within EmailJS attachment limits by packing attachments
      // into a single total byte budget.
      let usedBytes = 0;
      const addAttachmentIfFits = (
        key: string,
        dataUrl?: string,
        nameKey?: string,
        nameValue?: string,
      ) => {
        if (!dataUrl) return false;
        const bytes = estimateDataUrlBytes(dataUrl);
        if (usedBytes + bytes > MAX_TOTAL_ATTACHMENTS_BYTES) return false;
        payload[key] = dataUrl;
        if (nameKey && typeof nameValue === "string")
          payload[nameKey] = nameValue;
        usedBytes += bytes;
        return true;
      };

      // Prefer including the PDF + photo ID; then add reference photos as space allows.
      if (pdf) {
        // Re-add via helper to ensure budget is applied (payload already set above).
        delete payload.attachment;
        delete payload.attachment_name;
        addAttachmentIfFits(
          "attachment",
          pdf.attachment,
          "attachment_name",
          pdf.attachment_name,
        );
      }

      if (payload.photo_id) {
        const idUrl = payload.photo_id as string;
        const idName = payload.photo_id_name as string;
        delete payload.photo_id;
        delete payload.photo_id_name;
        const ok = addAttachmentIfFits(
          "photo_id",
          idUrl,
          "photo_id_name",
          idName,
        );
        if (!ok) {
          throw new Error(
            "Your Photo ID is too large to send via the form. Please upload a smaller image.",
          );
        }
      }

      let sentRefs = 0;
      for (let i = 0; i < compressedRefs.length; i++) {
        const r = compressedRefs[i];
        const ok = addAttachmentIfFits(
          `reference_${i + 1}`,
          r.dataUrl,
          `reference_${i + 1}_name`,
          r.fileName,
        );
        if (ok) sentRefs++;
        else break;
      }

      payload.referencePhotos_count = String(sentRefs);
      if (compressedRefs.length > sentRefs) {
        payload.referencePhotos_note = `Only ${sentRefs} of ${compressedRefs.length} reference photo(s) were included due to Email size limits.`;
      }

      // Final sanity check to avoid a failed request after doing work.
      if (usedBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
        throw new Error(
          "Attachments are too large to send (EmailJS limit is 500KB). Please remove some reference photos and try again.",
        );
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          template_params: payload,
        }),
      });

      if (!res.ok) {
        let details = "";
        try {
          const text = await res.text();
          details = text ? ` ${text}` : "";
        } catch {
          // ignore
        }
        throw new Error(
          `We couldn't send your request (EmailJS ${res.status}).${details}`,
        );
      }

      setSubmitSuccess(true);
      setSubmitSuccessMessage(
        "Thanks — your request was sent. We'll reply to your email soon.",
      );

      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    } catch (err: any) {
      const message =
        err?.message || "There was an error sending your request.";
      setSubmitError(message);
      setSubmitSuccess(false);
      setSubmitSuccessMessage(null);
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  const currentRef = useRef(current);
  const submittingRef = useRef(submitting);
  const goBackRef = useRef(goBack);
  const goNextRef = useRef(goNext);
  const submitRef = useRef(submit);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    goBackRef.current = goBack;
    goNextRef.current = goNext;
    submitRef.current = submit;
  }, [goBack, goNext, submit]);

  useEffect(() => {
    const isEditableElement = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
        return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (submittingRef.current) return;

      const active = document.activeElement;
      const editable = isEditableElement(active);

      const { id, canNext } = currentRef.current;

      if (e.key === "Escape" && !editable) {
        e.preventDefault();
        router.push("/");
        return;
      }

      if (e.key === "ArrowLeft" && !editable) {
        e.preventDefault();
        goBackRef.current();
        return;
      }

      if (e.key === "ArrowRight" && !editable) {
        e.preventDefault();
        if (id === "review" && !submitSuccess) submitRef.current();
        else if (canNext) goNextRef.current();
        return;
      }

      if (e.key === "Enter") {
        // Allow Shift+Enter to insert a newline in textarea.
        if (
          editable &&
          (active as HTMLElement | null)?.tagName === "TEXTAREA" &&
          e.shiftKey
        ) {
          return;
        }

        if (id === "review") {
          e.preventDefault();
          if (!submitSuccess) submitRef.current();
          return;
        }

        if (canNext) {
          e.preventDefault();
          goNextRef.current();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const CircleIconButton = ({
    variant,
    disabled,
    onClick,
    label,
    children,
  }: {
    variant: "accent" | "ghost";
    disabled?: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }) => (
    <BouncyButton
      type="button"
      aria-label={label}
      onClick={() => onClick()}
      disabled={disabled}
      className={
        "inline-flex items-center justify-center rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed " +
        (variant === "accent"
          ? "btn-accent-flow text-white shadow-[0_12px_28px_rgba(183,110,121,0.22)]"
          : "text-black border border-black/15 bg-white hover:bg-black/5")
      }
      style={
        {
          width: "var(--navSize)",
          height: "var(--navSize)",
          ...(variant === "accent"
            ? ({ ["--accent" as any]: ACCENT } as any)
            : null),
        } as any
      }
    >
      {children}
    </BouncyButton>
  );

  const ArrowLeftIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const ArrowRightIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const HomeIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );

  const hintForStep = (id: (typeof steps)[number]["id"]) => {
    switch (id) {
      case "email":
        return "We’ll only use this to reply about your booking.";
      case "tattooDescription":
        return "Placement, size, style, and any reference notes.";
      case "referencePhotos":
        return "Add up to 3 images that show the style/placement you want.";
      case "photoId":
        return "Upload an image of your ID.";
      case "consentInitials":
        return "Draw initials and tap Next to save.";
      case "signature":
        return "Draw signature and tap Next to save.";
      default:
        return "";
    }
  };

  const hint = hintForStep(current.id);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const referencePickerRef = useRef<HTMLInputElement | null>(null);

  const addReferenceFiles = (files: FileList | null) => {
    const incoming = files ? Array.from(files) : [];
    if (!incoming.length) return;

    const tooBig = incoming.find((f) => f.size > MAX_REFERENCE_PHOTO_BYTES);
    if (tooBig) {
      setStepError(
        "One of those images is too large. Please upload images under ~2MB each.",
      );
      return;
    }

    setData((d) => {
      const next = [...(d.referencePhotos || []), ...incoming].slice(
        0,
        MAX_REFERENCE_PHOTOS,
      );
      return { ...d, referencePhotos: next };
    });
    setStepError(null);
  };

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center"
      style={{
        // Scales the pill + circles together.
        // Tune once here instead of chasing multiple sizes.
        ["--navSize" as any]: "clamp(56px, 6.5vw, 76px)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="min-h-[76vh] flex flex-col items-center justify-center">
          <AnimatedQuestion text={current.title} />

          {hint ? (
            <p className="mt-3 text-center text-sm text-black/55 max-w-2xl">
              {hint}
            </p>
          ) : null}

          <div className="mt-10 w-full flex items-center justify-center gap-4">
            <CircleIconButton
              variant="ghost"
              label="Home"
              onClick={() => router.push("/")}
              disabled={submitting}
            >
              {HomeIcon}
            </CircleIconButton>

            <div className="relative w-full max-w-4xl">
              <div
                className="w-full rounded-full border border-black/15 bg-white shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
                style={{ height: "var(--navSize)" } as any}
              >
                <div
                  className="flex items-center w-full"
                  style={
                    {
                      height: "var(--navSize)",
                      // "Tabbed in" so typed text never collides with the back circle.
                      paddingLeft: "calc(var(--navSize) + 12px)",
                      paddingRight: "calc(var(--navSize) + 12px)",
                    } as any
                  }
                >
                  {current.id === "fullName" && (
                    <input
                      autoFocus
                      value={data.fullName}
                      onChange={(e) =>
                        setData((d) => ({ ...d, fullName: e.target.value }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl placeholder:text-black/35"
                      placeholder="Jane Doe"
                    />
                  )}

                  {current.id === "email" && (
                    <input
                      autoFocus
                      value={data.email}
                      onChange={(e) =>
                        setData((d) => ({ ...d, email: e.target.value }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl placeholder:text-black/35"
                      placeholder="you@example.com"
                      type="email"
                    />
                  )}

                  {current.id === "phone" && (
                    <input
                      autoFocus
                      value={data.phone}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          phone: formatUsPhone(e.target.value),
                        }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl placeholder:text-black/35"
                      placeholder="(555) 555-5555"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={14}
                    />
                  )}

                  {current.id === "tattooDescription" && (
                    <textarea
                      autoFocus
                      value={data.tattooDescription}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          tattooDescription: e.target.value,
                        }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl placeholder:text-black/35 resize-none"
                      placeholder="Placement, size, style…"
                      rows={1}
                    />
                  )}

                  {current.id === "dob" && (
                    <input
                      autoFocus
                      value={data.dob}
                      onChange={(e) =>
                        setData((d) => ({ ...d, dob: e.target.value }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl"
                      type="date"
                    />
                  )}

                  {current.id === "photoId" && (
                    <>
                      <input
                        ref={filePickerRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setData((d) => ({ ...d, photoId: f }));
                        }}
                      />
                      <BouncyButton
                        type="button"
                        className="w-full text-left text-xl md:text-2xl text-black/80"
                        onClick={() => filePickerRef.current?.click()}
                      >
                        {data.photoId?.name
                          ? `Selected: ${data.photoId.name}`
                          : "Tap to choose a file"}
                      </BouncyButton>
                    </>
                  )}

                  {current.id === "referencePhotos" && (
                    <>
                      <input
                        ref={referencePickerRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addReferenceFiles(e.target.files);
                          if (referencePickerRef.current)
                            referencePickerRef.current.value = "";
                        }}
                      />
                      <div className="grid gap-3">
                        <BouncyButton
                          type="button"
                          className="w-full text-left text-xl md:text-2xl text-black/80"
                          onClick={() => referencePickerRef.current?.click()}
                        >
                          {data.referencePhotos?.length
                            ? `Selected: ${data.referencePhotos.length} image${
                                data.referencePhotos.length === 1 ? "" : "s"
                              }`
                            : "Tap to add"}
                        </BouncyButton>

                        {stepError ? (
                          <div className="text-sm text-red-700">
                            {stepError}
                          </div>
                        ) : null}

                        {data.referencePhotos?.length ? (
                          <div className="grid gap-2">
                            {data.referencePhotos.map((f, idx) => (
                              <div
                                key={`${f.name}-${idx}`}
                                className="flex items-center justify-between gap-3 rounded-full border border-black/10 bg-white px-4 py-2"
                              >
                                <div className="text-sm text-black/80 truncate">
                                  {f.name}
                                </div>
                                <BouncyButton
                                  type="button"
                                  className="px-4 py-2 rounded-full border border-black/15 text-xs hover:bg-black/5"
                                  onClick={() =>
                                    setData((d) => ({
                                      ...d,
                                      referencePhotos: d.referencePhotos.filter(
                                        (_, i) => i !== idx,
                                      ),
                                    }))
                                  }
                                >
                                  Remove
                                </BouncyButton>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="text-xs text-black/45">
                          Up to {MAX_REFERENCE_PHOTOS} images.
                        </div>
                      </div>
                    </>
                  )}

                  {current.id === "consentInitials" && (
                    <div className="w-full text-left text-xl md:text-2xl text-black/70">
                      {data.initialsPngDataUrl
                        ? "Initials saved"
                        : "Draw initials below"}
                    </div>
                  )}

                  {current.id === "signature" && (
                    <div className="w-full text-left text-xl md:text-2xl text-black/70">
                      {data.signaturePngDataUrl
                        ? "Signature saved"
                        : "Draw signature below"}
                    </div>
                  )}

                  {current.id === "consentDate" && (
                    <input
                      autoFocus
                      value={data.consentDate}
                      onChange={(e) =>
                        setData((d) => ({ ...d, consentDate: e.target.value }))
                      }
                      className="w-full bg-transparent outline-none text-xl md:text-2xl"
                      type="date"
                    />
                  )}

                  {current.id === "review" && (
                    <div className="w-full text-left text-xl md:text-2xl text-black/70">
                      Review details below
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute left-0 top-1/2 -translate-y-1/2">
                <CircleIconButton
                  variant="ghost"
                  label="Back"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                >
                  {ArrowLeftIcon}
                </CircleIconButton>
              </div>

              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                {current.id === "review" ? (
                  <CircleIconButton
                    variant="accent"
                    label="Submit"
                    onClick={submit}
                    disabled={submitting || submitSuccess}
                  >
                    {ArrowRightIcon}
                  </CircleIconButton>
                ) : (
                  <CircleIconButton
                    variant="accent"
                    label="Next"
                    onClick={goNext}
                    disabled={!current.canNext || submitting}
                  >
                    {ArrowRightIcon}
                  </CircleIconButton>
                )}
              </div>
            </div>
          </div>

          {(current.id === "consentInitials" || current.id === "signature") && (
            <div className="mt-8 w-full max-w-2xl">
              {stepError ? (
                <div className="mb-3 text-sm text-red-700">{stepError}</div>
              ) : null}
              {current.id === "consentInitials" ? (
                <div className="grid gap-5">
                  <InitialsPad
                    ref={initialsPadRef}
                    value={data.initialsPngDataUrl}
                    onChange={(v) =>
                      setData((d) => ({ ...d, initialsPngDataUrl: v }))
                    }
                  />
                  <ConsentChecklist initialsMark={data.initialsPngDataUrl} />
                </div>
              ) : (
                <SignaturePadCanvas
                  ref={signaturePadRef}
                  value={data.signaturePngDataUrl}
                  onChange={(v) =>
                    setData((d) => ({ ...d, signaturePngDataUrl: v }))
                  }
                />
              )}
            </div>
          )}

          {current.id === "review" && (
            <div className="mt-8 w-full max-w-2xl grid gap-4">
              {submitSuccess ? (
                <div className="rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                  <div className="text-sm font-medium text-black">
                    {submitSuccessMessage || "Thanks — your request was sent."}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <BouncyButton
                      type="button"
                      className="px-5 py-2 rounded-full border border-black/15 text-sm hover:bg-black/5"
                      onClick={() => router.push("/")}
                    >
                      Back to home
                    </BouncyButton>
                    <BouncyButton
                      type="button"
                      className="px-5 py-2 rounded-full border border-black/15 text-sm hover:bg-black/5"
                      onClick={resetFunnel}
                    >
                      New request
                    </BouncyButton>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3">
                {(
                  [
                    ["Name", data.fullName],
                    ["Email", data.email],
                    ["Phone", data.phone || "(not provided)"],
                    [
                      "Reference photos",
                      data.referencePhotos?.length
                        ? `${data.referencePhotos.length} image${
                            data.referencePhotos.length === 1 ? "" : "s"
                          }`
                        : "(none)",
                    ],
                    ["DOB", data.dob],
                    ["Photo ID", data.photoId?.name || "(not selected)"],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-full border border-black/10 bg-white px-5 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs uppercase tracking-wide text-black/45">
                        {label}
                      </div>
                      <div className="text-sm md:text-base text-black font-medium text-right truncate max-w-[65%]">
                        {value}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-full border border-black/10 bg-white px-5 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs uppercase tracking-wide text-black/45">
                      Notes
                    </div>
                    <div className="text-sm md:text-base text-black font-medium text-right truncate max-w-[65%]">
                      {toSingleLine(data.tattooDescription) || "(none)"}
                    </div>
                  </div>
                </div>
              </div>

              {submitting && !submitSuccess ? (
                <div className="text-xs text-black/45 animate-pulse">
                  Sending…
                </div>
              ) : null}

              {submitError ? (
                <div className="text-sm text-red-700">{submitError}</div>
              ) : null}

              {!submitSuccess && !submitError ? (
                <div className="text-xs text-black/45">
                  By submitting, you confirm the information above is correct.
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-10 flex items-center gap-3">
            <div className="h-1.5 w-44 rounded-full bg-black/10 overflow-hidden">
              <div
                style={{ width: `${progressPct}%`, background: ACCENT }}
                className="h-full"
              />
            </div>
            <div className="text-xs text-black/45">
              Step {step + 1} / {totalSteps}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
