"use client";
import React from "react";

export default function BookingForm() {
  return (
    <div className="p-6 bg-white shadow rounded max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Booking form (placeholder)</h2>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-3">
          <input name="name" className="border p-2" placeholder="Name" />
          <input name="email" className="border p-2" placeholder="Email" />
          <input name="phone" className="border p-2" placeholder="Phone" />
          <textarea name="notes" className="border p-2" placeholder="Notes" />
          <button type="button" className="bg-ink text-white px-4 py-2 rounded">
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
