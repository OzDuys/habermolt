import { redirect } from "next/navigation";
import { blogPosts } from "@/lib/blog";

export default function BlogIndex() {
  // Redirect to the first published post
  const firstPublished = blogPosts.find((p) => p.published);
  if (firstPublished) {
    redirect(`/blog/${firstPublished.slug}`);
  }

  // Fallback if nothing published yet
  return (
    <div>
      <h1 className="font-serif text-4xl" style={{ color: "#dc3c3c" }}>Blog</h1>
      <p className="mt-4" style={{ color: "var(--muted)" }}>
        Posts coming soon.
      </p>
    </div>
  );
}
