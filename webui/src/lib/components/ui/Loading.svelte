<script lang="ts">
  /** Screen reader / `aria-label` text */
  export let label: string = 'Loading';
  /** Spinner diameter scale */
  export let size: 'sm' | 'md' | 'lg' = 'md';
  /** Visible caption under the spinner */
  export let showLabel: boolean = false;
</script>

<div
  class="loading"
  class:loading--labeled={showLabel}
  role="status"
  aria-live="polite"
  aria-busy="true"
  aria-label={label}
>
  <span class="spinner spinner--{size}" aria-hidden="true"></span>
  {#if showLabel}
    <span class="loading__text">{label}</span>
  {/if}
</div>

<style>
  .loading {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }
  .loading--labeled {
    gap: 0.875rem;
  }

  .spinner {
    display: block;
    border-radius: 50%;
    border-style: solid;
    border-color: var(--color-border);
    border-top-color: var(--color-primary);
    animation: loading-spin 0.65s linear infinite;
    flex-shrink: 0;
  }
  .spinner--sm {
    width: 1.125rem;
    height: 1.125rem;
    border-width: 2px;
  }
  .spinner--md {
    width: 2rem;
    height: 2rem;
    border-width: 2px;
  }
  .spinner--lg {
    width: 2.5rem;
    height: 2.5rem;
    border-width: 2.5px;
  }

  .loading__text {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    line-height: 1.4;
  }

  @keyframes loading-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
