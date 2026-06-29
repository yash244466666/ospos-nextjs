import { auth } from "@/lib/auth/options";

export default async function HomePage() {
  const session = await auth();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        Welcome, {session?.user?.name ?? "User"}
      </h1>
      <p className="text-slate-600">
        This is the OSPOS Next.js rewrite. Use the sidebar to navigate modules.
      </p>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded shadow-sm">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-sm text-slate-500">Sales today</div>
        </div>
        <div className="bg-white p-4 rounded shadow-sm">
          <div className="text-3xl font-bold text-green-600">0</div>
          <div className="text-sm text-slate-500">Items in stock</div>
        </div>
        <div className="bg-white p-4 rounded shadow-sm">
          <div className="text-3xl font-bold text-amber-600">0</div>
          <div className="text-sm text-slate-500">Suspended sales</div>
        </div>
      </div>
    </div>
  );
}