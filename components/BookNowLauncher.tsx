"use client";
import React, { useState } from "react";
import BookNowModal from "./BookNowModal";

export default function BookNowLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="book-now-btn inline-flex items-center justify-center px-16 py-4 rounded-full text-white font-medium border-amber-100 border-2"
        style={{
          background:
            "linear-gradient(135deg,#f8e6e8,#f0c3c7 35%,#b76e79 65%,#f6d3d6)",
          boxShadow: "0 8px 28px rgba(183,110,121,0.28)",
          fontSize: "18px",
          paddingLeft: "20px",
          paddingRight: "20px",
        }}
      >
        Book Now
      </button>
      <BookNowModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
