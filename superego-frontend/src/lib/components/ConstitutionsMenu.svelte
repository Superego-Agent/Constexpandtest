<!-- src/lib/components/ConstitutionsMenu.svelte -->
<script lang="ts">
  import IconCreate from '~icons/fluent/add-circle-24-regular';
  import IconSubmit from '~icons/fluent/send-24-regular';
  import IconFork from '~icons/fluent/copy-24-regular';
  import IconSimilar from '~icons/fluent/list-24-regular';
  
  // Navigation functions
  function navigateToCreate() {
    window.location.href = '/create';
  }
  
  function navigateToSubmit() {
    window.location.href = '/submit';
  }
  
  function navigateToFork() {
    window.location.href = '/fork';
  }
  
  function navigateToSimilar() {
    window.location.href = '/similar';
  }
  
  function logout() {
    // Handle logout logic here
    console.log('Logging out...');
    window.location.href = '/login';
  }
</script>

<div class="constitutions-container">
  <header>
    <h1>Constitutions</h1>
    <button class="logout-button" onclick={logout}>
      Logout <span class="arrow">→</span>
    </button>
  </header>
  
  <div class="menu-items">
    <!-- Create your own constitution -->
    <button class="menu-item" onclick={navigateToCreate}>
      <div class="icon"><IconCreate /></div>
      <span class="label">Create your own constitution</span>
    </button>
    
    <!-- Submit for approval -->
    <button class="menu-item" onclick={navigateToSubmit}>
      <div class="icon"><IconSubmit /></div>
      <span class="label">Submit for approval</span>
    </button>
    
    <!-- Fork another constitution -->
    <button class="menu-item" onclick={navigateToFork}>
      <div class="icon"><IconFork /></div>
      <span class="label">Fork another constitution</span>
    </button>
    
    <!-- Constitutions like yours -->
    <button class="menu-item" onclick={navigateToSimilar}>
      <div class="icon"><IconSimilar /></div>
      <span class="label">Constitutions like yours</span>
    </button>
  </div>
</div>

<style lang="scss">
  .constitutions-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 40px 20px;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 50px;
    
    h1 {
      font-size: 3.5rem;
      font-weight: 400;
      color: var(--text-primary);
      letter-spacing: 0.5px;
    }
    
    .logout-button {
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: 1.25rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 100px;
      transition: background-color 0.2s;
      
      &:hover {
        background-color: rgba(255, 255, 255, 0.05);
        
        .arrow {
          transform: translateX(3px);
        }
      }
      
      .arrow {
        transition: transform 0.2s;
      }
    }
  }
  
  .menu-items {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 20px;
  }
  
  .menu-item {
    display: flex;
    align-items: center;
    background-color: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 24px 28px;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.1s;
    text-align: left;
    
    &:hover {
      background-color: var(--card-hover);
      transform: translateY(-2px);
    }
    
    &:active {
      transform: translateY(0);
    }
    
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.75rem;
      color: var(--text-primary);
      margin-right: 16px;
      width: 40px;
    }
    
    .label {
      font-size: 1.5rem;
      color: var(--text-primary);
      font-weight: 300;
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    header h1 {
      font-size: 2.5rem;
    }
    
    .menu-item {
      padding: 20px 24px;
      
      .label {
        font-size: 1.25rem;
      }
    }
  }
</style>