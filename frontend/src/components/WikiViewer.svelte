<script lang="ts">
  import { onMount, tick, createEventDispatcher } from "svelte";
  import { marked }    from "marked";
  import matter        from "gray-matter";
  import mermaid       from "mermaid";
  import CodeBlock     from "./CodeBlock.svelte";
  import DemoFrame     from "./DemoFrame.svelte";
  import { getWikiPage, getCourseManifest, openExternalUrl } from "../lib/tauri";
  import { getOrderedModules } from "../lib/courseFlow";

  export let courseId: string | null = null;
  export let pageSlug: string = "";

  const dispatch = createEventDispatcher<{
    pageLoaded: { slug: string; title: string; content: string };
  }>();

  // -- state
  let manifest:    any    = null;
  let currentSlug: string = "";
  let rawMd:       string = "";
  let loading:     boolean = false;
  let error:       string  = "";

  let visited: Set<string> = new Set();
  let allPages: {slug:string; title:string; moduleTitle:string}[] = [];
  let lastSeenExternalPageSlug: string = "";

  interface Block {
    type: "html" | "code" | "demo";
    content: string;
    language?: string;
    title?: string;
  }
  let blocks: Block[] = [];

  onMount(() => {
    marked.setOptions({ gfm: true, breaks: true });

    const renderer = new marked.Renderer();
    renderer.link = ((...args: any[]) => {
      const token = args[0];
      const href = typeof token === "object" && token !== null ? token.href ?? "" : args[0] ?? "";
      const title = typeof token === "object" && token !== null ? token.title ?? null : args[1] ?? null;
      const text = typeof token === "object" && token !== null ? token.text ?? "" : args[2] ?? "";

      const normalized = normalizeInternalHref(String(href));
      if (normalized) {
        const safeTitle = title ? ` title="${escapeHtmlAttr(title)}"` : "";
        return `<a href="./${escapeHtmlAttr(normalized)}.md" data-wiki-slug="${escapeHtmlAttr(normalized)}"${safeTitle}>${text}</a>`;
      }
      
      // For external URLs, use onclick to open via Tauri
      const finalHref = href ?? "#";
      const safeTitle = title ? ` title="${escapeHtmlAttr(title)}"` : "";
      const encoded = encodeURIComponent(finalHref);
      const clickHandler = `window.__openWikiLink('${escapeHtmlAttr(encoded).replace(/'/g, "\\'")}'); return false;`;
      return `<a href="#" onclick="${clickHandler}"${safeTitle}>${text}</a>`;
    }) as any;
    marked.use({ renderer });
    
    // Global handler for external links in wiki pages
    (window as any).__openWikiLink = async (encoded: string) => {
      try {
        const url = decodeURIComponent(encoded);
        if (/^(https?:|mailto:|tel:)/.test(url)) {
          await openExternalUrl(url);
        }
      } catch (err) {
        console.error("Error opening link:", err);
      }
    };

    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: { background: "#0f1117", primaryColor: "#6366f1" },
    });
  });

  let loadedManifestFor: string | null = null;
  $: if (courseId && courseId !== loadedManifestFor) {
    console.log("📖 [WIKIVIEWER] courseId changed, loading manifest for:", courseId);
    loadManifest(courseId);
    lastSeenExternalPageSlug = "";
  }

  async function loadManifest(id: string) {
    console.log("📖 [WIKIVIEWER] loadManifest called with:", id);
    loadedManifestFor = id;
    manifest = null; allPages = []; error = "";
    const saved = localStorage.getItem(`visited:${id}`);
    visited = saved ? new Set(JSON.parse(saved)) : new Set();
    try {
      manifest = await getCourseManifest(id);
      console.log("📖 [WIKIVIEWER] Manifest loaded:", manifest?.title);
      buildAllPages();
    } catch (e: any) {
      console.log("📖 [WIKIVIEWER] Error loading manifest:", e);
      error = `Failed to load manifest: ${e}`;
    }
  }

  function buildAllPages() {
    allPages = [];
    const modules = getOrderedModules(manifest, courseId ?? "");
    for (const mod of modules) {
      for (const page of (mod.pages ?? [])) {
        allPages.push({ slug: page.slug, title: page.title, moduleTitle: mod.title });
      }
    }
  }

  $: if (courseId && pageSlug && pageSlug !== lastSeenExternalPageSlug) {
    lastSeenExternalPageSlug = pageSlug;
    if (pageSlug !== currentSlug) {
      console.log("📖 [WIKIVIEWER] 🔵 external pageSlug changed, old:", currentSlug, "new:", pageSlug, "courseId:", courseId);
      loadPage(pageSlug);
    }
  }
  $: if (courseId && !pageSlug && !currentSlug) {
    console.log("📖 [WIKIVIEWER] No pageSlug, loading index for courseId:", courseId);
    loadPage("index");
  }

  async function loadPage(slug: string) {
    if (!courseId) return;
    loading = true; error = "";
    try {
      rawMd = await getWikiPage(courseId, slug);
      console.log("📖 [WIKIVIEWER] Raw markdown loaded, length:", rawMd.length, "first 100 chars:", rawMd.slice(0, 100));
      
      currentSlug = slug;
      visited.add(slug);
      visited = visited;
      localStorage.setItem(`visited:${courseId}`, JSON.stringify([...visited]));
      
      blocks = parseContent(rawMd);
      console.log("📖 [WIKIVIEWER] Parsed blocks count:", blocks.length, "block types:", blocks.map(b => b.type).join(","));
      
      if (blocks.length === 0) {
        console.warn("📖 [WIKIVIEWER] WARNING: No blocks rendered from markdown!");
      }
      
      await tick();
      hydrateVisualMedia();
      renderMermaid();
      document.querySelector(".page-area")?.scrollTo({ top: 0, behavior: "smooth" });
      const pageEntry = allPages.find(p => p.slug === slug);
      const title = pageEntry?.title ?? slug;
      dispatch("pageLoaded", { slug, title, content: rawMd });
    } catch (e: any) {
      console.error("📖 [WIKIVIEWER] Error loading page:", e);
      error = `Page not found: ${slug}`;
    } finally {
      loading = false;
    }
  }

  $: currentIndex = allPages.findIndex(p => p.slug === currentSlug);
  $: prevPage = currentIndex > 0 ? allPages[currentIndex - 1] : null;
  $: nextPage = currentIndex >= 0 && currentIndex < allPages.length - 1
    ? allPages[currentIndex + 1] : null;
  $: currentPage = allPages.find(p => p.slug === currentSlug);
  $: readingTime = rawMd ? Math.max(1, Math.round(rawMd.split(/\s+/).length / 200)) : 0;
  $: isGettingStartedPage = currentPage?.moduleTitle?.toLowerCase() === "getting started";
  $: isOverviewPage = currentSlug === "overview" || currentPage?.title?.toLowerCase().includes("overview");
  $: orderedModulesForMap = getOrderedModules(manifest, courseId ?? "").filter((m: any) => (m.pages ?? []).length > 0);

  function parseContent(md: string): Block[] {
    try {
      const stripped = stripFrontmatter(md);
      console.log("📖 [WIKIVIEWER] After stripFrontmatter, length:", stripped.length);
      
      const normalized = normalizeWikiLinks(stripped);
      console.log("📖 [WIKIVIEWER] After normalizeWikiLinks, length:", normalized.length);
      
      const rawParts = splitBlocks(normalized);
      console.log("📖 [WIKIVIEWER] splitBlocks returned", rawParts.length, "parts");
      
      const result: Block[] = [];
      for (const part of rawParts) {
        if (part.type === "quiz") {
          // Quizzes are intentionally hidden for now.
          continue;
        } else if (part.type === "demo") {
          const titleMatch = part.content.match(/^<!--\s*title:\s*(.+?)\s*-->/);
          result.push({ type: "demo", content: part.content,
            title: titleMatch ? titleMatch[1] : "Interactive Demo" });
        } else if (part.type === "code") {
          result.push({ type: "code", content: part.content, language: part.language ?? "text" });
        } else {
          try {
            const html = marked.parse(part.content) as string;
            console.log("📖 [WIKIVIEWER] marked.parse produced HTML, length:", html.length);
            if (html.trim()) {
              result.push({ type: "html", content: html });
            } else {
              console.warn("📖 [WIKIVIEWER] marked.parse returned empty/whitespace HTML for text block");
            }
          } catch (err) {
            console.error("📖 [WIKIVIEWER] marked.parse error:", err);
          }
        }
      }
      console.log("📖 [WIKIVIEWER] parseContent final result:", result.length, "blocks");
      return result;
    } catch (err) {
      console.error("📖 [WIKIVIEWER] parseContent error:", err);
      return [];
    }
  }

  interface RawPart { type:"text"|"quiz"|"demo"|"code"; content:string; language?:string; }
  function trimLeadingLineBreak(input: string): string {
    if (input.startsWith("\r\n")) return input.slice(2);
    if (input.startsWith("\n") || input.startsWith("\r")) return input.slice(1);
    return input;
  }

  function findClosingFenceIndex(input: string, kind: "triple-colon" | "backticks"): { start: number; full: string } | null {
    const re = kind === "triple-colon"
      ? /(?:^|\r?\n):::\s*(?:\r?\n|$)/
      : /(?:^|\r?\n)```\s*(?:\r?\n|$)/;
    const match = re.exec(input);
    if (!match || typeof match.index !== "number") return null;
    return { start: match.index, full: match[0] };
  }

  function splitBlocks(src: string): RawPart[] {
    const parts: RawPart[] = [];
    let remaining = src;
    const FENCE_RE = /^(:::quiz|:::demo|```(\w*))\s*$/m;
    let iterCount = 0;
    while (remaining.length > 0 && iterCount < 1000) {
      iterCount++;
      const match = FENCE_RE.exec(remaining);
      if (!match) { 
        parts.push({ type: "text", content: remaining }); 
        break; 
      }
      if (match.index > 0) parts.push({ type: "text", content: remaining.slice(0, match.index) });
      const fence      = match[1];
      let afterFence = remaining.slice(match.index + match[0].length);
      afterFence = trimLeadingLineBreak(afterFence);
      if (fence === ":::quiz") {
        const close = findClosingFenceIndex(afterFence, "triple-colon");
        if (!close) { remaining = ""; continue; }
        parts.push({ type: "quiz", content: afterFence.slice(0, close.start).trim() });
        remaining = afterFence.slice(close.start + close.full.length);
      } else if (fence === ":::demo") {
        const close = findClosingFenceIndex(afterFence, "triple-colon");
        if (!close) { remaining = ""; continue; }
        parts.push({ type: "demo", content: afterFence.slice(0, close.start).trim() });
        remaining = afterFence.slice(close.start + close.full.length);
      } else {
        const lang  = match[2] ?? "text";
        const close = findClosingFenceIndex(afterFence, "backticks");
        if (!close) {
          parts.push({ type:"code", content:afterFence.trimEnd(), language:lang });
          remaining="";
        } else {
          parts.push({ type:"code", content:afterFence.slice(0, close.start), language:lang });
          remaining = afterFence.slice(close.start + close.full.length);
        }
      }
    }
    if (iterCount >= 1000) {
      console.warn("📖 [WIKIVIEWER] splitBlocks hit iteration limit!");
    }
    const filtered = parts.filter(p => p.content.trim());
    console.log("📖 [WIKIVIEWER] splitBlocks:", parts.length, "total parts,", filtered.length, "after filtering empty");
    return filtered;
  }

  async function tryCacheImage(img: HTMLImageElement): Promise<void> {
    if (img.dataset.cacheRetried === "1") return;
    if (!img.dataset.originalSrc && img.src && /^https?:\/\//.test(img.src)) {
      img.dataset.originalSrc = img.src;
    }
    const originalSrc = img.dataset.originalSrc;
    if (!originalSrc || !/^https?:\/\//.test(originalSrc)) return;
    img.dataset.cacheRetried = "1";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const localPath = await invoke<string>("fetch_image_cached", { url: originalSrc });
      // Derive MIME type from extension so the blob renders correctly in WebView2
      const ext = localPath.split(".").pop()?.toLowerCase() ?? "bin";
      const mime = ext === "gif" ? "image/gif"
                 : ext === "png" ? "image/png"
                 : ext === "webp" ? "image/webp"
                 : ext === "svg" ? "image/svg+xml"
                 : "image/jpeg";
      const bytes = await readFile(localPath);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      img.dataset.errorShown = "";
      img.style.display = "";
      img.src = blobUrl;
      // If even the blob URL fails to render (corrupt file etc.) show fallback
      img.addEventListener("error", () => showImgFallback(img), { once: true });
    } catch {
      // download or read failed — show static fallback
      showImgFallback(img);
    }
  }

  function showImgFallback(img: HTMLImageElement): void {
    if (img.dataset.errorShown === "1") return;
    img.dataset.errorShown = "1";
    img.style.display = "none";
    const fallback = document.createElement("div");
    fallback.className = "img-fallback";
    fallback.innerHTML = `<strong>Visual not available</strong><p>This diagram/image could not be loaded in the current environment.</p>`;
    if (img.parentElement) {
      img.parentElement.insertBefore(fallback, img.nextSibling);
    }
  }

  /** Returns true only for genuinely off-device URLs (not Tauri's own asset server). */
  function isExternalUrl(src: string): boolean {
    if (!/^https?:\/\//.test(src)) return false;
    // tauri.localhost and localhost are served locally — treat as internal
    if (/^https?:\/\/(tauri\.localhost|localhost)(:\d+)?(\/|$)/.test(src)) return false;
    return true;
  }

  function hydrateVisualMedia() {
    const imgs = document.querySelectorAll<HTMLImageElement>(".prose img");
    for (const img of Array.from(imgs)) {
      if (img.dataset.fallbackBound === "1") continue;
      img.dataset.fallbackBound = "1";

      // Locally-bundled images (served from tauri.localhost/images/) load directly.
      // Only intercept genuinely external URLs (Wikimedia, etc.) that need caching.
      if (img.src && isExternalUrl(img.src)) {
        img.dataset.originalSrc = img.src;
        img.src = "";         // stop the browser attempting the slow direct fetch
        tryCacheImage(img);   // backend downloads and serves from local cache
        continue;             // no error listener needed — tryCacheImage handles fallback
      }

      // For non-http images (data URIs, asset:// paths already served locally)
      // keep the error-event fallback as a safety net.
      img.addEventListener("error", async () => {
        if (img.dataset.errorShown === "1") return;
        if (img.dataset.originalSrc && !img.dataset.cacheRetried) {
          await tryCacheImage(img);
        } else {
          showImgFallback(img);
        }
      });

      if (img.complete && img.naturalWidth === 0 && img.dataset.originalSrc) {
        tryCacheImage(img);
      }
    }
  }

  async function renderMermaid() {
    await tick();
    const nodes = document.querySelectorAll<HTMLElement>(".mermaid-src");
    for (const node of Array.from(nodes)) {
      const id  = `mmd-${Math.random().toString(36).slice(2)}`;
      const src = node.textContent ?? "";
      try {
        const { svg } = await mermaid.render(id, src);
        const wrapper = node.closest(".mermaid-wrap") as HTMLElement;
        if (wrapper) {
          wrapper.innerHTML = svg;
          console.log("📖 [WIKIVIEWER] Mermaid diagram rendered successfully");
        }
      } catch (e) {
        console.warn("📖 [WIKIVIEWER] Mermaid render error:", e);
        const wrapper = node.closest(".mermaid-wrap") as HTMLElement;
        if (wrapper) {
          wrapper.innerHTML = `<div style="padding: 16px; color: var(--text-faint); font-size: 12px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px;">
            ⚠️ Diagram syntax error. Please check the diagram format.
          </div>`;
        }
      }
    }
  }

  function stripFrontmatter(md: string): string {
    // Primary parser handles both LF and CRLF and keeps body content intact.
    try {
      const parsed = matter(md);
      if (Object.keys(parsed.data ?? {}).length > 0 || parsed.content !== md) {
        console.log("📖 [WIKIVIEWER] Stripped front-matter (gray-matter), remaining length:", parsed.content.length);
        return parsed.content;
      }
    } catch (e) {
      console.warn("📖 [WIKIVIEWER] Front-matter parsing failed; falling back to regex:", e);
    }

    // Regex fallback for malformed frontmatter edge-cases.
    const fallback = md.replace(/^(?:\uFEFF)?---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
    return fallback;
  }

  function normalizeWikiLinks(md: string): string {
    return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, rawSlug, rawLabel) => {
      const slug = String(rawSlug).trim();
      const label = (rawLabel ? String(rawLabel) : slug)
        .replace(/[-_]+/g, " ")
        .trim();
      return `[${label}](wiki://${slug})`;
    });
  }

  function normalizeInternalHref(href: string): string | null {
    if (!href) return null;
    const cleaned = decodeURIComponent(href).trim();
    const withoutHash = cleaned.split("#")[0].split("?")[0].trim();
    if (withoutHash.startsWith("wiki://")) {
      const slug = withoutHash.slice("wiki://".length).trim();
      return slug || null;
    }
    if (/^(https?:|mailto:|tel:|#)/i.test(withoutHash)) return null;
    if (withoutHash.endsWith(".md")) {
      const slug = withoutHash
        .replace(/^\.\//, "")
        .replace(/^\//, "")
        .replace(/\.md$/, "")
        .split("/")
        .filter(Boolean)
        .pop()
        ?.trim();
      return slug || null;
    }
    if (/^[a-z0-9][a-z0-9-_/]*$/i.test(withoutHash) && !withoutHash.includes(".")) {
      const slug = withoutHash.split("/").filter(Boolean).pop()?.trim();
      return slug || null;
    }
    return null;
  }

  function escapeHtmlAttr(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function handleContentClick(event: MouseEvent) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const candidate = path.find((node) => node instanceof Element && (node as Element).matches("a[data-wiki-slug]"))
      ?? ((event.target instanceof Element) ? event.target.closest("a[data-wiki-slug]") : null);
    const link = candidate as HTMLAnchorElement | null;
    if (!link) return;
    const slug = link.dataset.wikiSlug?.trim();
    if (!slug) return;
    event.preventDefault();
    void loadPage(slug);
  }

  function linkDelegation(node: HTMLElement) {
    const handler = (event: Event) => handleContentClick(event as MouseEvent);
    node.addEventListener("click", handler);
    return {
      destroy() {
        node.removeEventListener("click", handler);
      },
    };
  }
</script>

{#if !courseId}
  <div class="empty">
    <div class="empty-glyph">📖</div>
    <p class="empty-title">Select a topic</p>
    <p class="empty-sub">Click any page in the course tree to start reading.</p>
  </div>

{:else if !manifest && !error}
  <div class="loading-state"><div class="spinner"></div><span>Loading course…</span></div>

{:else if error && !manifest}
  <div class="error-banner">{error}</div>

{:else}
  <div class="viewer">
    <main class="page-area">
      {#if loading}
        <div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>

      {:else if error}
        <div class="error-banner">{error}</div>

      {:else}
        {#if currentPage}
          <div class="page-meta-bar">
            <span class="breadcrumb">
              <span class="bc-course">{manifest?.title}</span>
              <span class="bc-sep">›</span>
              <span class="bc-module">{currentPage.moduleTitle}</span>
              <span class="bc-sep">›</span>
              <span class="bc-page">{currentPage.title}</span>
            </span>
            <span class="read-time">⏱ {readingTime} min read</span>
          </div>
        {/if}

        <div class="page-content" use:linkDelegation>
          {#if isGettingStartedPage}
            <div class="course-summary-card">
              {#if manifest?.description}
                <p class="summary-desc">{manifest.description}</p>
              {/if}
              {#if manifest?.difficulty}
                <p class="summary-meta"><strong>Difficulty:</strong> {manifest.difficulty}</p>
              {/if}
              {#if manifest?.placement_domains?.length}
                <p class="summary-meta"><strong>Target Roles:</strong> {manifest.placement_domains.join(", ")}</p>
              {/if}
              {#if manifest?.tags?.length}
                <div class="summary-tags">
                  {#each manifest.tags as tag}
                    <span class="summary-tag">{tag}</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if isOverviewPage && orderedModulesForMap.length > 0}
            <div class="flow-card">
              <p class="flow-title">Recommended Learning Flow</p>
              <p class="flow-sub">Move module-by-module so each concept builds on the previous one.</p>
              <div class="flow-grid">
                {#each orderedModulesForMap as mod}
                  <section class="flow-module">
                    <p class="flow-module-title">{mod.icon ?? "📚"} {mod.title}</p>
                    <ul class="flow-list">
                      {#each (mod.pages ?? []) as p}
                        <li>
                          <a href={`./${p.slug}.md`} data-wiki-slug={p.slug} on:click|preventDefault={() => loadPage(p.slug)}>{p.title}</a>
                        </li>
                      {/each}
                    </ul>
                  </section>
                {/each}
              </div>
            </div>
          {/if}

          {#each blocks as block (block)}
            {#if block.type === "demo"}
              <DemoFrame html={block.content} title={block.title ?? "Interactive Demo"} />
            {:else if block.type === "code"}
              {#if block.language === "mermaid"}
                <div class="mermaid-wrap">
                  <span class="mermaid-src" style="display:none">{block.content}</span>
                  <div class="mermaid-loading">Rendering diagram…</div>
                </div>
              {:else}
                <CodeBlock code={block.content} language={block.language ?? "text"} />
              {/if}
            {:else}
              <div class="prose">{@html block.content}</div>
            {/if}
          {/each}

          <div class="page-nav">
            {#if prevPage}
              {@const prev = prevPage}
              <button class="nav-btn nav-prev" on:click={() => loadPage(prev.slug)}>
                <span class="nav-arrow">←</span>
                <span class="nav-info">
                  <span class="nav-label">Previous</span>
                  <span class="nav-title">{prev.title}</span>
                </span>
              </button>
            {:else}
              <div></div>
            {/if}
            {#if nextPage}
              {@const next = nextPage}
              <button class="nav-btn nav-next" on:click={() => loadPage(next.slug)}>
                <span class="nav-info">
                  <span class="nav-label">Next</span>
                  <span class="nav-title">{next.title}</span>
                </span>
                <span class="nav-arrow">→</span>
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </main>
  </div>
{/if}

<style>
  .viewer { display: flex; height: 100%; overflow: hidden; }

  .empty, .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    height: 100%;
    color: var(--text-faint);
    font-size: 12px;
  }
  .empty-glyph {
    width: 56px; height: 56px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--accent-soft) 0%, rgba(139,92,246,.1) 100%);
    border: 1px solid rgba(99,102,241,.18);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--text-muted); }
  .empty-sub   { font-size: 11px; color: var(--text-faint); text-align: center; max-width: 220px; line-height: 1.6; }
  .spinner {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--border); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-banner {
    margin: 16px; padding: 12px 16px;
    background: rgba(239,68,68,.08);
    border: 1px solid rgba(239,68,68,.22);
    border-radius: 10px;
    color: #fca5a5; font-size: 12px;
  }

  .page-area { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

  .page-meta-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 24px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .breadcrumb { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .bc-course  { font-size: 10px; color: var(--text-faint); }
  .bc-sep     { font-size: 10px; color: var(--text-faint); opacity: .4; }
  .bc-module  { font-size: 10px; color: var(--text-faint); }
  .bc-page    { font-size: 10px; color: var(--text-muted); font-weight: 600; }
  .read-time  { font-size: 10px; color: var(--text-faint); white-space: nowrap; }

  .page-content {
    padding: 28px; max-width: 900px; margin: 0 auto;
    width: 100%; box-sizing: border-box;
  }

  .course-summary-card {
    margin-bottom: 20px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-panel);
  }

  .summary-desc {
    margin: 0 0 8px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .summary-meta {
    margin: 4px 0;
    font-size: 11px;
    color: var(--text-faint);
  }

  .summary-tags {
    margin-top: 10px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .summary-tag {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    background: var(--bg-active);
    color: var(--text-faint);
    border: 1px solid var(--border-soft);
  }

  .flow-card {
    margin: 0 0 22px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-panel);
  }

  .flow-title {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .flow-sub {
    margin: 0 0 12px;
    font-size: 11px;
    color: var(--text-faint);
  }

  .flow-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .flow-module {
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 10px;
    background: var(--bg-elevated);
  }

  .flow-module-title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 650;
    color: var(--text-muted);
  }

  .flow-list {
    margin: 0;
    padding-left: 16px;
    display: grid;
    gap: 5px;
  }

  .flow-list a {
    color: var(--accent-h);
    text-decoration: none;
    font-size: 11px;
    line-height: 1.4;
  }

  .flow-list a:hover {
    text-decoration: underline;
  }

  .page-nav {
    display: flex; justify-content: space-between; gap: 12px;
    margin-top: 36px; padding-top: 22px; border-top: 1px solid var(--border);
  }
  .nav-btn {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 10px; cursor: pointer;
    transition: border-color 150ms, background 150ms, box-shadow 150ms;
    max-width: 45%;
  }
  .nav-btn:hover {
    border-color: rgba(99,102,241,.4);
    background: var(--bg-panel);
    box-shadow: var(--shadow-sm);
  }
  .nav-next { flex-direction: row-reverse; text-align: right; }
  .nav-arrow { font-size: 16px; color: var(--accent); flex-shrink: 0; }
  .nav-info  { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .nav-label { font-size: 9px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .07em; }
  .nav-title {
    font-size: 11px; color: var(--text); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Prose */
  :global(.prose h1) { font-size: 22px; font-weight: 750; color: var(--text); margin: 0 0 18px; line-height: 1.3; letter-spacing: -.02em; }
  :global(.prose h2) {
    font-size: 16px; font-weight: 650; color: var(--text); margin: 28px 0 12px;
    padding-bottom: 7px; border-bottom: 1px solid var(--border);
    letter-spacing: -.01em;
  }
  :global(.prose h3) { font-size: 14px; font-weight: 650; color: var(--text); margin: 18px 0 8px; }
  :global(.prose h4) { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 14px 0 6px; }
  :global(.prose p)  { font-size: 13px; color: var(--text-muted); line-height: 1.8; margin-bottom: 13px; }
  :global(.prose ul, .prose ol) { font-size: 13px; color: var(--text-muted); padding-left: 22px; margin-bottom: 12px; }
  :global(.prose li) { margin-bottom: 5px; line-height: 1.7; }
  :global(.prose strong) { color: var(--text); font-weight: 650; }
  :global(.prose em) { color: var(--accent-h); font-style: italic; }
  :global(.prose code) {
    background: var(--bg-elevated); border: 1px solid var(--border);
    padding: 2px 6px; border-radius: 5px;
    color: var(--accent-h); font-size: 11.5px; font-family: "Fira Code", monospace;
  }
  :global(.prose pre) {
    background: var(--bg-code, #0c0e14); border: 1px solid var(--border);
    padding: 16px; border-radius: 10px; overflow-x: auto; margin: 14px 0;
  }
  :global(.prose pre code) { background: transparent; border: none; padding: 0; color: #c9d1d9; }
  :global(.prose blockquote) {
    border-left: 3px solid var(--accent); padding: 10px 16px; margin: 14px 0;
    background: var(--accent-dim); border-radius: 0 10px 10px 0;
  }
  :global(.prose blockquote p) { margin: 0; color: var(--accent-h); }
  :global(.prose table) { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 12px; }
  :global(.prose th) {
    background: var(--bg-elevated); padding: 8px 12px; text-align: left;
    color: var(--text-muted); border: 1px solid var(--border); font-weight: 650;
  }
  :global(.prose td) { padding: 7px 12px; color: var(--text-muted); border: 1px solid var(--border); }
  :global(.prose tr:nth-child(even) td) { background: var(--bg-panel); }
  :global(.prose img) {
    max-width: 100%; border-radius: 10px; margin: 14px 0;
    border: 1px solid var(--border); display: block;
    box-shadow: var(--shadow-sm);
  }
  :global(.prose .img-fallback) {
    margin: 14px 0;
    border: 1px dashed var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    background: var(--bg-panel);
    color: var(--text-faint);
    font-size: 12px;
  }
  :global(.prose .img-fallback strong) {
    color: var(--text-muted);
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
  }
  :global(.prose .img-fallback p) { margin: 0; }
  :global(.prose a) { color: var(--accent); text-decoration: none; }
  :global(.prose a:hover) { text-decoration: underline; }
  :global(.prose hr) { border: none; border-top: 1px solid var(--border); margin: 24px 0; }

  .mermaid-wrap {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px; margin: 14px 0;
    overflow-x: auto; text-align: center;
  }
  .mermaid-loading { color: var(--text-faint); font-size: 12px; }
  :global(.mermaid-wrap svg) { max-width: 100%; }
</style>
