<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Popover } from 'bits-ui';
  import Search from 'lucide-svelte/icons/search';
  import Tag from 'lucide-svelte/icons/tag';
  import CalendarRange from 'lucide-svelte/icons/calendar-range';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import TagsOverlay from '$lib/components/ui/TagsOverlay.svelte';
  import SearchOverlay from '$lib/components/ui/SearchOverlay.svelte';
  import {
    DAYS_OPTIONS,
    buildFeedsHref,
    clearFilterHref,
    feedsDaysLabel,
    parseFeedsFilters,
  } from '$lib/feedsUrl';

  let channels: { id: string; title: string }[] = [];

  $: if (channels.length === 0 && typeof window !== 'undefined') {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((list: { id: string; title?: string }[]) => {
        channels = Array.isArray(list) ? list.map((s) => ({ id: s.id, title: s.title || s.id })) : [];
      });
  }

  $: filters = parseFeedsFilters($page.url.searchParams);

  $: daysLabel = feedsDaysLabel(filters);

  let showTagsOverlay = false;
  let showDaysDialog = false;
  let showChannelDialog = false;
  let showSearchOverlay = false;

  function feedsHref(ch: string, withDays?: number, overrides?: { ref?: string; author?: string; tags?: string }) {
    return buildFeedsHref(filters, ch, withDays, overrides);
  }

  function clearHref(omit: 'ref' | 'author' | 'search' | 'tags') {
    return clearFilterHref(filters, omit);
  }

  function selectDays(days: number | undefined) {
    const ch = filters.channel || 'all';
    goto(feedsHref(ch, days), { replaceState: false });
  }

  function onTagSelect(tag: string) {
    goto(feedsHref(filters.channel || 'all', undefined, { tags: tag }), { replaceState: false });
  }

  function selectChannel(id: string) {
    goto(feedsHref(id, filters.days), { replaceState: false });
    showChannelDialog = false;
  }

  $: currentChannelTitle =
    !filters.channel || filters.channel === 'all'
      ? '全部'
      : channels.find((c) => c.id === filters.channel)?.title ?? filters.channel;

  function submitSearch(q: string) {
    const p = new URLSearchParams();
    p.set('channel', filters.channel || 'all');
    if (filters.ref) p.set('ref', filters.ref);
    if (filters.author) p.set('author', filters.author);
    if (filters.tags) p.set('tags', filters.tags);
    if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
    if (q) p.set('search', q);
    goto('/feeds?' + p.toString(), { replaceState: false });
  }

  $: showBar =
    !!filters.channel ||
    channels.length > 0 ||
    !!filters.ref ||
    !!filters.author ||
    !!filters.search ||
    !!filters.tags;
</script>

{#if showBar}
  <div class="feeds-nav">
    <div class="filter-bar-row">
      <div class="filter-bar-left">
        {#if filters.ref}
          <a class="ref-instead-of-channel" href={clearHref('ref')} title={filters.ref}>
            <span class="ref-value">{filters.ref}</span>
            <span class="filter-tag-x" aria-hidden="true">x</span>
          </a>
        {:else if channels.length > 0}
          <div class="channel-buttons channel-buttons-row">
            <a
              class="channel-btn"
              class:active={filters.channel === 'all' || !filters.channel}
              href={feedsHref('all', filters.days)}>全部</a>
            {#each channels as ch}
              <a
                class="channel-btn"
                class:active={ch.id === filters.channel}
                href={feedsHref(ch.id, filters.days)}>{ch.title}</a>
            {/each}
          </div>
          <div class="channel-mobile-popover">
            <Popover.Root bind:open={showChannelDialog} onOpenChange={(v) => (showChannelDialog = v)}>
              <Popover.Trigger
                class="filter-icon-btn"
                title={`频道：${currentChannelTitle}`}
                aria-label={`频道，${currentChannelTitle}`}
              >
                <LayoutGrid size={16} aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="feeds-toolbar-dropdown" sideOffset={4} align="start">
                  <div class="days-options">
                    <button
                      type="button"
                      class="days-option"
                      class:active={filters.channel === 'all' || !filters.channel}
                      on:click={() => selectChannel('all')}
                    >
                      全部
                    </button>
                    {#each channels as ch}
                      <button
                        type="button"
                        class="days-option"
                        class:active={ch.id === filters.channel}
                        on:click={() => selectChannel(ch.id)}
                      >
                        {ch.title}
                      </button>
                    {/each}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        {/if}
      </div>
      <div class="filter-bar-right">
        <button
          type="button"
          class="filter-icon-btn"
          title="搜索"
          aria-label="搜索"
          on:click={() => (showSearchOverlay = true)}
        >
          <Search size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="filter-icon-btn"
          title="Tags"
          aria-label="Filter by tag"
          on:click={() => (showTagsOverlay = true)}
        >
          <Tag size={16} aria-hidden="true" />
        </button>
        <Popover.Root bind:open={showDaysDialog} onOpenChange={(v) => (showDaysDialog = v)}>
          <Popover.Trigger
            class="filter-icon-btn"
            title={`时间范围：${daysLabel}`}
            aria-label={`时间范围，${daysLabel}`}
          >
            <CalendarRange size={16} aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="feeds-toolbar-dropdown" sideOffset={4} align="end">
              <div class="days-options">
                {#each DAYS_OPTIONS as opt}
                  <button
                    type="button"
                    class="days-option"
                    class:active={filters.days === opt.value}
                    on:click={() => {
                      selectDays(opt.value);
                      showDaysDialog = false;
                    }}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
    {#if filters.author || filters.search || filters.tags}
      <div class="filter-tags-row">
        <div class="filter-tags">
          {#if filters.author}
            <a class="filter-tag" href={clearHref('author')} title="Remove author filter">
              <span>Author: {filters.author}</span>
              <span class="filter-tag-x" aria-hidden="true">x</span>
            </a>
          {/if}
          {#if filters.search}
            <a class="filter-tag" href={clearHref('search')} title="Remove search filter">
              <span>Search: {filters.search}</span>
              <span class="filter-tag-x" aria-hidden="true">x</span>
            </a>
          {/if}
          {#if filters.tags}
            <a class="filter-tag" href={clearHref('tags')} title="Remove tag filter">
              <span>Tag: {filters.tags}</span>
              <span class="filter-tag-x" aria-hidden="true">x</span>
            </a>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<TagsOverlay open={showTagsOverlay} onClose={() => (showTagsOverlay = false)} onSelect={onTagSelect} />
<SearchOverlay
  open={showSearchOverlay}
  initialQuery={filters.search ?? ''}
  onClose={() => (showSearchOverlay = false)}
  onSubmit={submitSearch}
/>

<style>
  .feeds-nav {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }
  .filter-bar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1rem;
    min-width: 0;
  }
  .filter-bar-left {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    min-width: 0;
  }
  .filter-tags-row {
    display: flex;
    align-items: center;
    min-height: 1.5rem;
  }
  .channel-buttons-row {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.4rem;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .channel-buttons-row::-webkit-scrollbar {
    height: 4px;
  }
  .channel-buttons-row::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar-thumb);
    border-radius: 999px;
  }
  .channel-mobile-popover {
    display: none;
    flex-shrink: 0;
  }
  @media (max-width: 640px) {
    .channel-buttons-row {
      display: none;
    }
    .channel-mobile-popover {
      display: block;
    }
  }
  .channel-btn {
    padding: 0.42rem 0.7rem;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground-strong);
    background: transparent;
    border-radius: var(--radius-sm, 6px);
    text-decoration: none;
    transition: color 0.12s ease, background 0.12s ease;
  }
  .channel-btn:hover {
    color: var(--color-accent-foreground);
    background: var(--color-muted);
  }
  .channel-btn.active {
    color: var(--color-primary);
    font-weight: 500;
  }
  .ref-instead-of-channel {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.42rem 0.7rem;
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-primary);
    background: transparent;
    border-radius: 6px;
    text-decoration: none;
    transition: color 0.15s;
    width: max-content;
    max-width: 100%;
  }
  .ref-instead-of-channel:hover {
    color: var(--color-primary-hover, var(--color-primary));
  }
  .ref-instead-of-channel .ref-value {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-muted-foreground-strong);
  }
  .ref-instead-of-channel .filter-tag-x {
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
  }
  .filter-bar-right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  :global(.feeds-nav .filter-icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.125rem;
    height: 2.125rem;
    padding: 0;
    margin: 0;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  :global(.feeds-nav .filter-icon-btn:focus) {
    outline: none;
  }
  :global(.feeds-nav .filter-icon-btn:focus-visible) {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  :global(.feeds-nav .filter-icon-btn:hover) {
    color: var(--color-accent-foreground);
    background: var(--color-muted);
  }
  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .filter-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: var(--color-muted-foreground-strong);
    background: var(--color-muted);
    border-radius: var(--radius-sm, 6px);
    text-decoration: none;
    transition: color 0.15s, background 0.15s;
  }
  .filter-tag:hover {
    color: var(--color-accent-foreground);
    background: var(--color-accent);
  }
  .filter-tag-x {
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
  }
  /* Portal 挂载在 body，不能依赖 .feeds-nav 祖先选择器 */
  :global(.feeds-toolbar-dropdown) {
    z-index: 100;
    background: var(--color-card-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-panel);
    overflow: auto;
    max-height: min(70vh, 320px);
  }
  .days-options {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem;
    min-width: 7rem;
  }
  .days-option {
    padding: 0.4rem 0.65rem;
    font-size: 0.8125rem;
    text-align: left;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--color-muted-foreground-strong);
    transition: color 0.15s;
  }
  .days-option:hover {
    color: var(--color-accent-foreground);
  }
  .days-option.active {
    color: var(--color-primary);
    font-weight: 500;
  }
</style>
