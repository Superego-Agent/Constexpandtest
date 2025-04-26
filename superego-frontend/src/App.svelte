<script lang="ts">
  import { sessionStore } from '$lib/state/session.svelte';
  import { threadStore } from '$lib/state/threads.svelte';
  import { onMount } from 'svelte';
  import { constitutionStore } from '$lib/state/constitutions.svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import ChatInterface from '$lib/components/ChatInterface.svelte';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import AdminReviewPanel from '$lib/state/adminreviewpanel.svelte';
  import MarketplaceBrowser from '$lib/state/marketplacebrowser.svelte';
  import SubmissionsPage from '$lib/state/submissionspage.svelte';
  import './lib/styles/theme.css';
  import './lib/styles/dark-theme.css';

  // Current route state for navigation
  let currentRoute = $state(window.location.pathname);

  onMount(async () => {
    try {
      // Configure route handling
      const handleRouteChange = () => {
        currentRoute = window.location.pathname;
      };
      
      window.addEventListener('popstate', handleRouteChange);
      
      // Intercept link clicks for SPA navigation
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('/')) {
          e.preventDefault();
          const href = target.getAttribute('href') || '/';
          history.pushState(null, '', href);
          currentRoute = href;
        }
      });

      // --- Session Initialization Logic ---
      const currentActiveId = sessionStore.activeSessionId;
      if (currentActiveId === null) {
        const currentSessions = sessionStore.uiSessions;
        const sessionIds = Object.keys(currentSessions);
        if (sessionIds.length > 0) {
          // Activate the first existing session found
          sessionStore.setActiveSessionId(sessionIds[0]);
          console.log(`[App.svelte] Activated existing session: ${sessionIds[0]}`);
        } else {
          // No sessions exist, create a new one
          console.log('[App.svelte] No existing sessions found, creating a new one.');
          sessionStore.createNewSession(); // This function already sets it as active
        }
      }
      
      return () => {
        window.removeEventListener('popstate', handleRouteChange);
      };
    } catch (error) {
      console.error("App onMount Error:", error);
    }
  });

  // Function to determine which component to show based on route
  function getRouteComponent() {
    if (currentRoute.startsWith('/admin/review')) {
      return AdminReviewPanel;
    } else if (currentRoute.startsWith('/marketplace')) {
      return MarketplaceBrowser;
    } else if (currentRoute.startsWith('/submissions')) {
      return SubmissionsPage;
    } else {
      return ChatInterface;
    }
  }
</script>

<main class="app-layout">
  <div class="app-header">
    <h1 class="app-title" onclick={() => { history.pushState(null, '', '/'); currentRoute = '/'; }}>
      <span class="logo-text">Superego</span>
      <span class="subtitle">Demo</span>
    </h1>
    <div class="navigation-indicator">
      {#if currentRoute !== '/'}
        <span class="current-route">{currentRoute.slice(1).charAt(0).toUpperCase() + currentRoute.slice(2)}</span>
      {/if}
    </div>
    <div class="theme-toggle-container">
      <ThemeToggle />
    </div>
  </div>
  <div class="app-content">
    <Sidebar />
    
    <!-- Dynamically render the appropriate component based on route -->
    {#if currentRoute.startsWith('/admin/review')}
      <AdminReviewPanel />
    {:else if currentRoute.startsWith('/marketplace')}
      <MarketplaceBrowser />
    {:else if currentRoute.startsWith('/submissions')}
      <SubmissionsPage />
    {:else}
      <ChatInterface />
    {/if}
  </div>
</main>

<style>
  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden; /* Prevent layout issues */
    background-color: var(--bg-primary);
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background-color: var(--bg-elevated);
    border-bottom: 1px solid var(--input-border);
    height: 50px;
    flex-shrink: 0;
  }

  .app-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .app-title {
    margin: 0;
    display: flex;
    align-items: center; /* Changed to horizontal alignment */
    font-size: 1em; /* Make the entire title smaller */
    cursor: pointer; /* Make it clear the logo is clickable */
  }

  .logo-text {
    background: linear-gradient(135deg, var(--primary-light), var(--secondary));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-size: 1em; /* Reduced from 1.4em */
    font-weight: bold;
  }

  .subtitle {
    margin-left: 8px; /* Add space between Superego and Demo */
    font-size: 0.9em;
    color: var(--text-secondary);
    font-weight: normal;
  }
  
  .navigation-indicator {
    display: flex;
    align-items: center;
    margin-left: 16px;
  }
  
  .current-route {
    font-size: 0.9em;
    color: var(--text-secondary);
    font-style: italic;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
    background-color: var(--bg-primary);
    color: var(--text-primary);
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
    touch-action: manipulation;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  @media (max-width: 768px) {
    .app-layout {
      flex-direction: column;
    }
  }

  @supports (-webkit-touch-callout: none) {
    .app-layout {
      height: -webkit-fill-available;
    }
  }

  .theme-toggle-container {
    margin-left: auto;
  }

  @media (max-width: 768px) {
    .app-content {
      flex-direction: column;
    }
  }
</style>