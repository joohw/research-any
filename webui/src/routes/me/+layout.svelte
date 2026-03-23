<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  /**
   * 鉴权只放在 /me 子树：根布局始终挂顶栏。
   * 首次进入 /me 时校验；在 /me 内跳转时本 layout 不卸载，ready 保持 true，顶栏不会「刷新」。
   */
  let ready = false;

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        await goto('/', { replaceState: true });
        return;
      }
    } catch {
      await goto('/', { replaceState: true });
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <div class="me-root">
    <slot />
  </div>
{:else}
  <div class="me-auth-pending" aria-busy="true"></div>
{/if}

<style>
  .me-root {
    box-sizing: border-box;
    width: 100%;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .me-auth-pending {
    flex: 1;
    min-height: 12rem;
    min-width: 0;
  }
</style>
