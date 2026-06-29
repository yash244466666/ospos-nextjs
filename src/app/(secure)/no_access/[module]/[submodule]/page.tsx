import Link from "next/link";

export default function NoAccessPage({ params }: { params: Promise<{ module: string; submodule: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-3xl font-bold text-red-600 mb-2">Access Denied</h1>
      <p className="text-slate-600 mb-6">
        You do not have permission to access this module.
      </p>
      <Link href="/" className="text-blue-600 hover:underline">
        Return to Home
      </Link>
    </div>
  );
}