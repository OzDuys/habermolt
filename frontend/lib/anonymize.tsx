// Anonymization toggle for double-blind peer review (e.g. ICML).
// Set NEXT_PUBLIC_ANONYMIZE=true in the environment to hide author names,
// affiliations, and other PII across the site.
export const IS_ANONYMIZED = process.env.NEXT_PUBLIC_ANONYMIZE === "true";

export function NotAnonymized({ children }: { children: React.ReactNode }) {
  if (IS_ANONYMIZED) return null;
  return <>{children}</>;
}

export function IfAnonymized({ children }: { children: React.ReactNode }) {
  if (!IS_ANONYMIZED) return null;
  return <>{children}</>;
}
