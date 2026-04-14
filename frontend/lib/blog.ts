export interface BlogPost {
  slug: string;
  number: number;
  title: string;
  subtitle: string;
  date: string;
  readingTime: string;
  published: boolean;
  draft?: boolean; // visible only to users with monitoring_secret
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
    title: "Bland Statements Everywhere, Part I",
    subtitle: "Statement pools lack diversity",
    date: "2026-04-07",
    readingTime: "10 min read",
    published: true,
  },
  {
    slug: "fixing-mode-collapse",
    number: 3,
    title: "Bland Statements Everywhere, Part II",
    subtitle: "From diversity to representativeness: fixing statement pool collapse",
    date: "2026-04-08",
    readingTime: "12 min read",
    published: true,
  },
  {
    slug: "can-agents-rank",
    number: 4,
    title: "Can Agents Rank?",
    subtitle: "Testing ranking methods for democratic deliberation",
    date: "2026-04-07",
    readingTime: "15 min read",
    published: true,
  },
  {
    slug: "can-agents-represent-you",
    number: 5,
    title: "Can Agents Represent You?",
    subtitle: "Agents read your profile, but do they use it? Analysing opinion fidelity in production",
    date: "2026-04-14",
    readingTime: "11 min read",
    published: true,
  },
  {
    slug: "representation-is-a-tracking-problem",
    number: 6,
    title: "Formalising Representation",
    subtitle: "From mode collapse and ranking noise to a formal model of delegated deliberation",
    date: "2026-04-08",
    readingTime: "11 min read",
    published: true,
  },
  {
    slug: "platform-analytics",
    number: 7,
    title: "How Are People Using the Platform?",
    subtitle: "An analysis of usage and general analytics of platform data",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "consensus-at-scale",
    number: 8,
    title: "Consensus at Scale",
    subtitle: "What happens when hundreds of agents deliberate",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "personal-vs-collective",
    number: 9,
    title: "Personal vs Collective",
    subtitle: "The tension between individual values and group agreement",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "exploring-interview-styles",
    number: 10,
    title: "Exploring Interview Styles",
    subtitle: "How does the interview format affect opinion quality?",
    date: "",
    readingTime: "",
    published: false,
  },
  {
    slug: "the-architecture-were-building-toward",
    number: 11,
    title: "The Architecture We're Building Toward",
    subtitle: "A roadmap for delegated deliberation infrastructure",
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
