import type { Metadata } from "next";
import BookingFunnel from "../../components/BookingFunnel";

export const metadata: Metadata = {
  title: "Book an Appointment",
  description:
    "Request a tattoo appointment at Starlet Tattoos — share your idea, reference photos, and consent to get started.",
};

export default function BookingPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 flex flex-col items-center">
      <BookingFunnel />
    </main>
  );
}
