import { auth } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import { changePasswordAction } from "./actions";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">Change Password</h1>
      <form action={changePasswordAction} className="space-y-4 bg-white p-6 rounded shadow-sm">
        <div>
          <label className="block text-sm font-medium mb-1">New Password</label>
          <input name="new_password" type="password" required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirm Password</label>
          <input name="confirm_password" type="password" required className="w-full border rounded px-3 py-2" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Update Password</button>
      </form>
    </div>
  );
}
