"use client";
import React from "react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div className="brand">Starlet Tattoos 2026</div>
        <div className="meta">
          Hand-drawn vibes &mdash; permanent art, tender care.
        </div>
      </div>

      <style jsx>{`
        .site-footer {
          width: 100%;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          padding: 36px 20px;
          display: flex;
          justify-content: center;
          background: linear-gradient(
            180deg,
            rgba(6, 6, 7, 0.96),
            rgba(10, 10, 12, 0.98)
          );
          color: #ffffff;
          position: relative;
          z-index: 50;
        }
        .inner {
          max-width: 1100px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .brand {
          font-weight: 700;
          letter-spacing: 0.6px;
        }
        .meta {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.66);
        }

        @media (max-width: 640px) {
          .inner {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .meta {
            margin-top: 8px;
          }
        }
      `}</style>
    </footer>
  );
}
