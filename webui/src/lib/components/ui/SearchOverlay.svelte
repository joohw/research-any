<script lang="ts">
  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  /** 打开时回填 */
  export let initialQuery = '';
  /** 提交关键词（可空表示清除搜索条件） */
  export let onSubmit: ((q: string) => void) | undefined = undefined;

  let input = '';
  let inputEl: HTMLInputElement | null = null;

  $: if (open) {
    input = initialQuery ?? '';
    queueMicrotask(() => inputEl?.focus());
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('overlay-backdrop')) onClose?.();
  }

  function submit() {
    onSubmit?.(input.trim());
    onClose?.();
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && onClose?.()} />

{#if open}
  <div
    class="overlay-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="搜索"
    tabindex="-1"
    on:click={handleBackdropClick}
    on:keydown={(e) => e.key === 'Escape' && onClose?.()}
  >
    <div class="overlay-panel">
      <div class="overlay-header">
        <h2>搜索</h2>
        <p class="overlay-desc">输入关键词筛选标题、摘要或作者</p>
        <button type="button" class="overlay-close" on:click={onClose} aria-label="关闭">×</button>
      </div>
      <div class="overlay-body">
        <form class="search-form" on:submit|preventDefault={submit}>
          <input
            type="search"
            class="search-field"
            placeholder="标题、摘要、作者…"
            bind:value={input}
            bind:this={inputEl}
            autocomplete="off"
          />
          <div class="search-actions">
            <button type="submit" class="search-apply">
              <span class="search-apply-label">搜索</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .overlay-panel {
    width: 100%;
    max-width: 480px;
    max-height: min(85vh, 520px);
    display: flex;
    flex-direction: column;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: var(--shadow-panel);
    overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .overlay-header {
    position: relative;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border-muted, #eee);
    flex-shrink: 0;
  }
  .overlay-header h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.2rem;
  }
  .overlay-desc {
    font-size: 0.75rem;
    color: var(--color-muted-foreground-soft);
    margin: 0;
  }
  .overlay-close {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 1.25rem;
    line-height: 1;
    color: var(--color-muted-foreground);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .overlay-close:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }

  .overlay-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .search-field {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    color: var(--color-foreground);
    background: var(--color-muted);
    border: none;
    border-radius: 8px;
    outline: none;
    transition:
      background 0.15s,
      box-shadow 0.15s;
  }
  .search-field::placeholder {
    color: var(--color-muted-foreground-soft);
  }
  .search-field:focus {
    background: var(--color-card-elevated);
    box-shadow: 0 0 0 1px var(--color-border);
  }

  .search-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* 与 TagsOverlay 中 .tag-badge 一致的块级按钮 */
  .search-apply {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    background: var(--color-muted);
    border: none;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--color-foreground);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .search-apply:hover {
    background: var(--color-primary-light, #e5e7eb);
    color: var(--color-primary);
  }
  .search-apply-label {
    font-weight: 500;
  }
</style>
