<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';

  /** 与 FeedCard 单条展示字段对齐；平铺列表，无堆叠 */
  interface FeedGroupOverlayRow {
    title: string;
    link: string;
    summary?: string;
    author?: string;
    authors?: { name: string; href: string }[];
    pubDate?: string;
    source?: string;
    sourceHref?: string;
    authorHref?: string;
  }

  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  export let items: FeedGroupOverlayRow[] = [];

  function relativeTime(dateStr?: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose?.();
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && (e.preventDefault(), onClose?.())} />

{#if open}
  <div
    class="feed-group-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feed-group-overlay-title"
    tabindex="-1"
    on:click={backdropClick}
    on:keydown={(e) => e.key === 'Escape' && (e.preventDefault(), onClose?.())}
    in:fade={{ duration: 280, easing: cubicOut }}
    out:fade={{ duration: 200, easing: cubicIn }}
  >
    <div class="feed-group-overlay-body" in:fly={{ y: 28, duration: 360, delay: 40, easing: cubicOut }}>
      <div class="feed-group-overlay-header">
        <h2 id="feed-group-overlay-title" class="feed-group-overlay-title">同组条目</h2>
        <button type="button" class="feed-group-overlay-close" on:click={() => onClose?.()} aria-label="关闭">
          ×
        </button>
      </div>
      <div class="feed-group-overlay-scroll">
        {#each items as row, i (row.link + ':' + i)}
          <article class="feed-group-flat-card">
            {#if row.link}
              <a class="flat-title" href={row.link} target="_blank" rel="noopener">{row.title || '(无标题)'}</a>
            {:else}
              <span class="flat-title">{row.title || '(无标题)'}</span>
            {/if}
            {#if row.summary}
              <p class="flat-summary">{row.summary}</p>
            {/if}
            <div class="flat-meta">
              {#if row.source}
                {#if row.sourceHref}
                  <a class="flat-source" href={row.sourceHref} title={row.source}>{row.source}</a>
                {:else}
                  <span class="flat-source">{row.source}</span>
                {/if}
              {/if}
              {#if row.authors && row.authors.length > 0}
                {#if row.source}<span class="flat-dot"></span>{/if}
                <span class="flat-meta-authors">
                  <span class="flat-by">by </span>
                  {#each row.authors as a, j}
                    <a class="flat-author-link" href={a.href}>{a.name}</a>{#if j < row.authors.length - 1}<span class="flat-author-sep">、</span>{/if}
                  {/each}
                </span>
              {:else if row.author}
                {#if row.source}<span class="flat-dot"></span>{/if}
                <span class="flat-by">by </span>
                {#if row.authorHref}
                  <a class="flat-author-link" href={row.authorHref}>{row.author}</a>
                {:else}
                  <span>{row.author}</span>
                {/if}
              {/if}
              {#if row.source || row.author || (row.authors && row.authors.length)}
                <span class="flat-dot"></span>
              {/if}
              <span>{relativeTime(row.pubDate)}</span>
            </div>
          </article>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .feed-group-overlay {
    --feed-group-inset: clamp(0.75rem, 2.2vw, 1.35rem);
    box-sizing: border-box;
    position: fixed;
    inset: 0;
    z-index: 99;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 0;
    padding: var(--feed-group-inset);
    overflow: hidden;
    background: rgba(0, 0, 0, 0.52);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overscroll-behavior: contain;
    touch-action: none;
  }

  .feed-group-overlay-body {
    width: 100%;
    max-width: min(720px, 100%);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius-lg, 12px);
    background: var(--color-background);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-border) 80%, transparent),
      0 25px 50px -12px rgba(0, 0, 0, 0.28);
    touch-action: auto;
  }

  .feed-group-overlay-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .feed-group-overlay-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-foreground);
  }
  .feed-group-overlay-close {
    appearance: none;
    border: none;
    background: transparent;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm, 6px);
    font-size: 1.35rem;
    line-height: 1;
    color: var(--color-muted-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
  }
  .feed-group-overlay-close:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .feed-group-overlay-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem 0;
  }
  .feed-group-overlay-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .feed-group-overlay-scroll::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }

  .feed-group-flat-card {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border-muted);
  }
  .feed-group-flat-card:last-child {
    border-bottom: none;
  }

  .flat-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-foreground);
    line-height: 1.45;
    margin-bottom: 0.35rem;
    text-decoration: none;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    word-break: break-word;
  }
  a.flat-title:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }

  .flat-summary {
    font-size: 0.8rem;
    color: var(--color-muted-foreground-strong);
    line-height: 1.55;
    margin: 0 0 0.45rem;
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    overflow: hidden;
  }

  .flat-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.725rem;
    color: var(--color-muted-foreground-soft);
  }
  .flat-source {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    text-decoration: none;
  }
  a.flat-source:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .flat-dot {
    width: 2px;
    height: 2px;
    background: var(--color-muted-foreground-soft);
    border-radius: 50%;
    flex-shrink: 0;
  }
  .flat-by {
    color: var(--color-muted-foreground-soft);
    margin-right: 0.1em;
  }
  .flat-meta-authors {
    min-width: 0;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .flat-author-link {
    color: inherit;
    text-decoration: none;
  }
  .flat-author-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .flat-author-sep {
    color: var(--color-muted-foreground-soft);
  }
</style>
