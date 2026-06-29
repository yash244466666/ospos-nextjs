import { redirect } from "next/navigation";

export default function RootSecureRedirect() {
  redirect("/home");
}