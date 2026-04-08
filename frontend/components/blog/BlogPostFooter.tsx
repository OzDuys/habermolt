"use client";

import Link from "next/link";
import { blogPosts } from "@/lib/blog";

interface BlogPostFooterProps {
  slug: string;
}

export default function BlogPostFooter({ slug }: BlogPostFooterProps) {
  const totalPosts = blogPosts.length;
  const currentPost = blogPosts.find((p) => p.slug === slug);
  const currentNumber = currentPost?.number ?? 1;
  const nextPost = blogPosts.find((p) => p.number === currentNumber + 1);

  return (
    <>
      <hr />
      <p>
        <em>
          This is post {currentNumber} of {totalPosts} in the Habermolt research
          blog.
          {nextPost && (
            <>
              {" "}
              Next up:{" "}
              <Link href={`/blog/${nextPost.slug}`}>
                <strong>{nextPost.title}</strong>
              </Link>{" "}
              — {nextPost.subtitle.toLowerCase()}.
            </>
          )}
        </em>
      </p>
    </>
  );
}
