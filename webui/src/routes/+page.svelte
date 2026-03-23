<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Coffee from 'lucide-svelte/icons/coffee';
  import { siGithub } from 'simple-icons';

  type Step = 'email' | 'code';

  let step: Step = 'email';
  let email = '';
  let code = '';
  let loading = false;
  let error = '';
  let toast = '';
  let resendCooldown = 0;
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  let googleEnabled = false;
  let githubEnabled = false;

  $: nextUrl = $page.url.searchParams.get('next') ?? '/feeds?channel=all';

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        await goto(nextUrl, { replaceState: true });
        return;
      }
    } catch {
      /* stay */
    }

    try {
      const res = await fetch('/api/auth/providers');
      if (res.ok) {
        const data: { google?: boolean; github?: boolean } = await res.json();
        googleEnabled = data.google ?? false;
        githubEnabled = data.github ?? false;
      }
    } catch {
      /* ignore */
    }

    const authParam = $page.url.searchParams.get('auth');
    if (authParam === 'error') {
      const msg = $page.url.searchParams.get('msg') ?? '登录失败';
      error =
        msg === 'github_no_email'
          ? 'GitHub 未返回邮箱，请确认账号邮箱为公开状态'
          : decodeURIComponent(msg);
    }
  });

  onDestroy(() => {
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (toastTimer) clearTimeout(toastTimer);
  });

  function showToast(message: string, duration = 2200) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = '';
      toastTimer = null;
    }, duration);
  }

  function oauthHref(provider: string): string {
    return `/api/auth/${provider}`;
  }

  function startCooldown(seconds = 60) {
    resendCooldown = seconds;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) {
        resendCooldown = 0;
        if (cooldownTimer) clearInterval(cooldownTimer);
      }
    }, 1000);
  }

  async function sendCode() {
    error = '';
    if (!email || !email.includes('@')) {
      error = '请输入有效的邮箱地址';
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '发送失败';
        return;
      }
      step = 'code';
      startCooldown(60);
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;
    error = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '发送失败';
        return;
      }
      startCooldown(60);
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  async function verifyCode() {
    error = '';
    if (!code || code.length < 6) {
      error = '请输入 6 位验证码';
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '验证失败';
        return;
      }
      await goto(nextUrl, { replaceState: true });
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  function handleEmailKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') sendCode();
  }

  function handleCodeKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') verifyCode();
  }

  function handleCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v = el.value.replace(/\D/g, '').slice(0, 6);
    code = v;
    el.value = v;
  }
</script>

<svelte:head>
  <title>rssany</title>
  <meta
    name="description"
    content="rssany：每日几分钟跟进 AI 领域论文、产品与人物动向；邮箱登录即可使用 Feeds、Agent 与订阅管理。"
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
  <link
    href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="landing">
  {#if toast}
    <div class="toast" role="status" aria-live="polite">{toast}</div>
  {/if}
  <header class="top">
    <div class="top-row">
      <div class="logo" aria-label="rssany">
        <span class="logo-icon" aria-hidden="true">
          <Coffee size={16} />
        </span>
        <span>rssany</span>
      </div>
      <a
        class="github-repo"
        href="https://github.com/joohw/research-any"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="在 GitHub 上查看源码"
      >
        <svg
          class="github-icon"
          role="img"
          viewBox="0 0 24 24"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path fill="currentColor" d={siGithub.path} />
        </svg>
      </a>
    </div>
  </header>

  <main class="main">
    {#if step === 'email'}
      <h1 class="title">
        每日几分钟，读懂<span class="title-em">  AI  </span>正在发生什么
      </h1>
      <p class="desc">
        论文、产品、人物与可订阅信息流。用邮箱登录即可使用 Feeds、Agent 与订阅管理。
      </p>

      {#if error}
        <div class="alert" role="alert">{error}</div>
      {/if}

      <div class="email-bar">
        <input
          id="landing-email"
          type="email"
          class="email-input"
          bind:value={email}
          on:keydown={handleEmailKeydown}
          placeholder="你的常用邮箱…"
          autocomplete="email"
          disabled={loading}
        />
        <button type="button" class="cta" disabled={loading || !email} on:click={sendCode}>
          {loading ? '发送中…' : '获取验证码'}
        </button>
      </div>

      <a class="browse" href="/feeds?channel=all">先浏览信息流 →</a>

      {#if googleEnabled || githubEnabled}
        <div class="divider"><span>或使用以下方式登录</span></div>
        <div class="oauth-row">
          {#if googleEnabled}
            <a class="oauth ghost" href={oauthHref('google')}>
              <svg class="oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </a>
          {/if}
          {#if githubEnabled}
            <a class="oauth ghost" href={oauthHref('github')}>
              <svg
                class="oauth-icon"
                role="img"
                viewBox="0 0 24 24"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path fill="currentColor" d={siGithub.path} />
              </svg>
              GitHub
            </a>
          {/if}
        </div>
      {/if}
    {:else}
      <h1 class="title title-sm">输入验证码</h1>
      <p class="desc">验证码已发送至 <strong>{email}</strong></p>

      {#if error}
        <div class="alert" role="alert">{error}</div>
      {/if}

      <div class="code-wrap">
        <input
          id="landing-code"
          type="text"
          inputmode="numeric"
          class="code-input"
          bind:value={code}
          on:input={handleCodeInput}
          on:keydown={handleCodeKeydown}
          placeholder="000000"
          autocomplete="one-time-code"
          maxlength="6"
          disabled={loading}
        />
      </div>

      <button type="button" class="cta cta-block" disabled={loading || code.length < 6} on:click={verifyCode}>
        {loading ? '验证中…' : '登录'}
      </button>

      <div class="code-actions">
        <button
          type="button"
          class="linkish"
          disabled={loading}
          on:click={() => {
            step = 'email';
            error = '';
            code = '';
          }}
        >
          ← 更换邮箱
        </button>
        <button type="button" class="linkish" disabled={loading || resendCooldown > 0} on:click={resendCode}>
          {resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送'}
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .landing {
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    background:
      radial-gradient(ellipse 90% 55% at 50% -15%, rgba(94, 106, 210, 0.28), transparent 55%),
      radial-gradient(ellipse 70% 40% at 80% 60%, rgba(94, 106, 210, 0.08), transparent 50%),
      #050508;
    color: #ececed;
    padding: 1.25rem 1.25rem 2.5rem;
    box-sizing: border-box;
  }

  .toast {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 120;
    max-width: min(84vw, 20rem);
    padding: 0.55rem 0.8rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: #fecaca;
    background: rgba(235, 87, 87, 0.14);
    border: 1px solid rgba(235, 87, 87, 0.38);
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .top {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 0.25rem 0 1rem;
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
  }

  .github-repo {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #a1a1aa;
    text-decoration: none;
    transition: color 0.15s ease;
    flex-shrink: 0;
  }

  .github-repo:hover {
    color: #fafafa;
  }

  .github-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    opacity: 0.9;
    display: block;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.9375rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #f4f4f5;
  }

  .logo-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    color: #d4d4d8;
    opacity: 0.92;
    transform: translateY(-0.5px);
    flex-shrink: 0;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    max-width: 34rem;
    width: 100%;
    margin: 0 auto;
    gap: 1.25rem;
  }

  .title {
    font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif;
    font-size: clamp(2rem, 6vw, 2.75rem);
    font-weight: 400;
    line-height: 1.15;
    margin: 0;
    color: #fafafa;
    letter-spacing: -0.02em;
  }

  .title-sm {
    font-size: clamp(1.75rem, 5vw, 2.25rem);
  }

  .title-em {
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-style: normal;
    letter-spacing: -0.04em;
  }

  .desc {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.55;
    color: #9a9da8;
    max-width: 26rem;
  }

  .desc strong {
    color: #d4d4d8;
    font-weight: 500;
  }

  .alert {
    width: 100%;
    max-width: 26rem;
    font-size: 0.8125rem;
    color: #fecaca;
    background: rgba(235, 87, 87, 0.12);
    border: 1px solid rgba(235, 87, 87, 0.35);
    border-radius: 8px;
    padding: 0.65rem 0.9rem;
    text-align: left;
  }

  .email-bar {
    display: flex;
    width: 100%;
    max-width: 26rem;
    align-items: stretch;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  }

  .email-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0.85rem 1rem;
    font-size: 0.9375rem;
    font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, monospace;
    color: #f4f4f5;
    outline: none;
  }

  .email-input::placeholder {
    color: #6b6f78;
  }

  .email-input:disabled {
    opacity: 0.55;
  }

  .cta {
    flex-shrink: 0;
    border: none;
    padding: 0 1.15rem;
    background: #fafafa;
    color: #0a0a0b;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  .cta:hover:not(:disabled) {
    background: #fff;
  }

  .cta:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .cta-block {
    width: 100%;
    max-width: 26rem;
    padding: 0.85rem 1rem;
    border-radius: 10px;
  }

  .browse {
    font-size: 0.8125rem;
    color: #8b8e98;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .browse:hover {
    color: #d4d4d8;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 26rem;
    color: #6b6f78;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .oauth-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: center;
  }

  .oauth {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .oauth.ghost {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: transparent;
    color: #e4e4e7;
  }

  .oauth.ghost:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .oauth-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .code-wrap {
    width: 100%;
    max-width: 26rem;
  }

  .code-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    padding: 0.9rem 1rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.35em;
    text-align: center;
    color: #fafafa;
    font-family: ui-monospace, monospace;
    outline: none;
  }

  .code-input:focus {
    border-color: rgba(94, 106, 210, 0.55);
  }

  .code-input:disabled {
    opacity: 0.55;
  }

  .code-actions {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 26rem;
    margin-top: 0.25rem;
  }

  .linkish {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8125rem;
    color: #8b8e98;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s ease;
  }

  .linkish:hover:not(:disabled) {
    color: #d4d4d8;
  }

  .linkish:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
