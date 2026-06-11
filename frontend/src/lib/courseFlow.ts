export interface CoursePage {
  slug: string;
  title: string;
  type?: string;
}

export interface CourseModule {
  id?: string;
  slug?: string;
  title: string;
  icon?: string;
  pages?: CoursePage[];
}

const ALGORITHMS_CORE_ORDER = [
  "asymptotic-analysis",
  "recurrence-relations",
  "divide-conquer",
  "sorting-algorithms",
  "linear-sorting",
  "greedy",
  "dynamic-programming",
  "dp-advanced",
  "graph-algorithms",
  "minimum-spanning-tree",
  "shortest-path",
  "network-flow",
  "string-algorithms",
  "suffix-arrays",
  "backtracking",
  "amortized-analysis",
  "randomized-algorithms",
  "number-theory-algorithms",
  "computational-geometry",
  "online-algorithms",
  "parallel-algorithms",
  "complexity-theory",
  "approximation-algorithms",
  "competitive-programming",
];

function pageRank(courseId: string, moduleId: string, slug: string): number {
  if (courseId === "algorithms" && moduleId === "core-lectures") {
    const index = ALGORITHMS_CORE_ORDER.indexOf(slug);
    if (index >= 0) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortPages(courseId: string, moduleId: string, pages: CoursePage[]): CoursePage[] {
  return [...pages].sort((a, b) => {
    const aSlug = String(a.slug ?? "");
    const bSlug = String(b.slug ?? "");
    const rankDiff = pageRank(courseId, moduleId, aSlug) - pageRank(courseId, moduleId, bSlug);
    if (rankDiff !== 0) return rankDiff;
    return String(a.title ?? aSlug).localeCompare(String(b.title ?? bSlug));
  });
}

function moduleOrderRank(moduleId: string): number {
  const order = ["getting-started", "core-lectures", "practice", "career-prep", "reference"];
  const idx = order.indexOf(moduleId);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

export function getOrderedModules(manifest: any, courseId: string): CourseModule[] {
  const rawModules: CourseModule[] = manifest?.modules ?? manifest?.topics ?? [];
  const modules = [...rawModules].sort((a, b) => {
    const aId = String(a?.id ?? a?.slug ?? "");
    const bId = String(b?.id ?? b?.slug ?? "");
    const rankDiff = moduleOrderRank(aId) - moduleOrderRank(bId);
    if (rankDiff !== 0) return rankDiff;
    return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
  });

  return modules.map((mod) => {
    const moduleId = String(mod?.id ?? mod?.slug ?? "");
    const rawPages = mod?.pages ?? [];
    let pages = sortPages(courseId, moduleId, rawPages);

    if (moduleId === "getting-started") {
      const indexPage = pages.find((p) => p.slug === "index");
      const overviewPage = pages.find((p) => p.slug === "overview");
      const rest = pages.filter((p) => p.slug !== "index" && p.slug !== "overview");
      pages = [
        ...(indexPage ? [indexPage] : []),
        ...(overviewPage ? [overviewPage] : []),
        ...rest,
      ];
    }

    return { ...mod, pages };
  });
}
