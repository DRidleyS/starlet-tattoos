"use client";
import React from "react";
import Link from "next/link";

export default function BookNowLauncher() {
  return (
    <>
      <Link
        href="/booking"
        className="rose-gold-btn btn-bounce btn-accent-flow inline-flex items-center justify-center px-10 md:px-14 py-4 rounded-full text-white font-medium text-lg"
      >
        Book Now
      </Link>
    </>
  );
}
