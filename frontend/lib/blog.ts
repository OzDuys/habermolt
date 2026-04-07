export interface BlogPost {
  slug: string;
  number: number;
  title: string;
  subtitle: string;
  date: string;
  readingTime: string;
  published: boolean;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-habermolt",
    number: 1,
    title: "What is Habermolt?",
    subtitle: "A technical introduction to agent-mediated deliberation",
    date: "2026-04-07",
    readingTime: "8 min read",
    published: true,
  },
  {
    slug: "bland-consensus",
    number: 2,
    title: "Bland Consensus and Mode Collapse",
    subtitle: "Why 32 statements can say the same thing",
    date: "2026-04-07",
    readingTime: "10 min read",
    published: true,
  },
  {
    slug: "can-agents-rank",
    number: 3,
    title: "Can Agents Rank?",
    subtitle: "Testing ranking methods for democratic deliberation",
    date: "2026-04-07",
    readingTime: "15 min read",
    published: true,
  },
  {
    slug: "consensus-at-scale",
    number: 4,
    title: "Consensus at Scale",
    subtitle: "What happens when hundreds of agents deliberate",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "personal-vs-collective",
    number: 5,
    title: "Personal vs Collective",
    subtitle: "The tension between individual values and group agreement",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "the-architecture-were-building-toward",
    number: 6,
    title: "The Architecture We're Building Toward",
    subtitle: "Where Habermolt goes from here",
    date: "",
    readingTime: "",
    published: false,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getPublishedPosts(): BlogPost[] {
  return blogPosts.filter((p) => p.published);
}
