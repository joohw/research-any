<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { meUser, setMeUserFromAuthBody } from '$lib/meAreaStore';
  import { clearMeSessionAndRedirectHome, redirectIfUnauthorizedResponse } from '$lib/meAuthSession';

  /**
   * 鉴权只放在 /me 子树：根布局始终挂顶栏。
   * 已有 meUser 缓存时先展示，再在后台请求 `/api/auth/me`；401/403 清状态回首页。
   * 在 /me 内跳转时本 layout 不卸载，ready 保持 true。
   */
  let ready = false;

  onMount(async () => {
    const hadCached = get(meUser).loaded && !!get(meUser).user;
    if (hadCached) ready = true;

    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (await redirectIfUnauthorizedResponse(res)) return;

      if (!res.ok) {
        if (hadCached) return;
        await clearMeSessionAndRedirectHome();
        return;
      }

      const data = await res.json();
      setMeUserFromAuthBody(data);
      ready = true;
    } catch {
      if (hadCached) return;
      await clearMeSessionAndRedirectHome();
    }
  });
</script>

{#if ready}
  <div class="me-root">
    <slot />
  </div>
{:else}
  <div class="me-auth-pending" aria-busy="true" aria-live="polite">
    <span class="me-auth-pending-text">加载账户…</span>
  </div>
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
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-foreground);
    font-size: 0.8125rem;
  }

  .me-auth-pending-text {
    padding: 0.5rem 0;
  }
</style>
