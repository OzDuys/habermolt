"use client";

import SignInModal from "@/components/SignInModal";

export default function SignInPage() {
  return <SignInModal open={true} onClose={() => window.history.back()} />;
}
