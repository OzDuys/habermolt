import { redirect } from "next/navigation";

export default function NotificationsRedirect() {
  redirect("/profile?tab=notifications");
}
