import { requirePermission } from "@/lib/auth/with-permission";
import MessagesForm from "@/components/messages/messages-form";

export default async function MessagesPage() {
  await requirePermission("messages");
  return <MessagesForm />;
}