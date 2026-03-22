import { createServerClient } from "@/lib/supabase-server";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-300",
  contacted: "bg-yellow-500/20 text-yellow-300",
  booked: "bg-purple-500/20 text-purple-300",
  completed: "bg-green-500/20 text-green-300",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const supabase = createServerClient();
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, created_at, full_name, email, phone, status")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-red-400">Failed to load bookings: {error.message}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Bookings</h1>

      {!bookings || bookings.length === 0 ? (
        <p className="text-neutral-500">No bookings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Email</th>
                <th className="pb-3 pr-4">Phone</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-neutral-800/50 hover:bg-neutral-900/50"
                >
                  <td className="py-3 pr-4 font-medium">{b.full_name}</td>
                  <td className="py-3 pr-4 text-neutral-400">{b.email}</td>
                  <td className="py-3 pr-4 text-neutral-400">{b.phone}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[b.status] || STATUS_COLORS.new}`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-neutral-500">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="text-rose-400 hover:text-rose-300 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
