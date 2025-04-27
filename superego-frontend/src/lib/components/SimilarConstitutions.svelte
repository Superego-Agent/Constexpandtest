<script lang="ts">
  import { constitutionStore } from '$lib/state/constitutions.svelte';
  // Add other imports as needed
  
  // Sample similar constitutions data
  let similarConstitutions = $state([
    {
      id: "sim-1",
      title: "Basic Safety Guidelines",
      similarity: 0.87,
      author: "AI Safety Institute",
      description: "Core principles for ensuring AI systems operate safely and ethically."
    },
    {
      id: "sim-2",
      title: "Creative Assistant Framework",
      similarity: 0.74,
      author: "Creative Commons",
      description: "Guidelines for AI systems that assist with creative tasks like writing and design."
    },
    {
      id: "sim-3",
      title: "Educational AI Constitution",
      similarity: 0.68,
      author: "Education First",
      description: "Framework for AI systems designed for educational environments."
    }
  ]);
  
  function viewConstitution(id: string) {
    console.log(`Viewing constitution with ID: ${id}`);
    // Navigate to constitution details
  }
</script>

<div class="similar-constitutions">
  <h2>Constitutions Similar to Yours</h2>
  
  <div class="similarity-intro">
    <p>Based on your constitutions, we've found these similar frameworks that might interest you:</p>
  </div>
  
  <div class="constitution-list">
    {#each similarConstitutions as constitution}
      <div class="constitution-card" onclick={() => viewConstitution(constitution.id)}>
        <div class="similarity-badge">{Math.round(constitution.similarity * 100)}% similar</div>
        <h3>{constitution.title}</h3>
        <div class="author">By: {constitution.author}</div>
        <p class="description">{constitution.description}</p>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .similar-constitutions {
    padding: var(--space-md);
    max-width: 1000px;
    margin: 0 auto;
  }
  
  h2 {
    font-size: 2rem;
    font-weight: 400;
    margin-bottom: var(--space-md);
    color: var(--text-primary);
  }
  
  .similarity-intro {
    margin-bottom: var(--space-lg);
    
    p {
      font-size: 1.1rem;
      color: var(--text-secondary);
    }
  }
  
  .constitution-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }
  
  .constitution-card {
    background-color: var(--bg-surface);
    border: 1px solid var(--card-border, var(--input-border));
    border-radius: var(--radius-md);
    padding: var(--space-md);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    
    h3 {
      margin-top: var(--space-sm);
      margin-bottom: var(--space-xs);
      font-size: 1.2rem;
      color: var(--text-primary);
    }
    
    .author {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: var(--space-sm);
    }
    
    .description {
      font-size: 0.95rem;
      color: var(--text-secondary);
    }
    
    .similarity-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: var(--primary);
      color: white;
      padding: 4px 8px;
      border-radius: var(--radius-pill);
      font-size: 0.8rem;
      font-weight: 500;
    }
  }
</style>


<script lang="ts">
  import { onMount } from 'svelte';
  import { constitutionStore } from '$lib/state/constitutions.svelte';
  import { fetchSimilarConstitutions } from '$lib/api/rest.svelte';
  import ConstitutionInfoModal from '../components/ConstitutionInfoModal.svelte';
  import IconInfo from '~icons/fluent/info-24-regular';
  import IconStar from '~icons/fluent/star-24-regular';
  import IconStarFilled from '~icons/fluent/star-24-filled';
  import IconCopy from '~icons/fluent/copy-24-regular';
  
  // Component state
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let similarConstitutions = $state<SimilarConstitution[]>([]);
  let selectedConstitution = $state<SimilarConstitution | null>(null);
  let showInfoModal = $state(false);
  let selectedConstitutionContent = $state<string | null>(null);
  let contentIsLoading = $state(false);
  let selectedSourceId = $state<string | null>(null);
  
  // Source filtering state
  let filterSource = $state<'all' | 'mine' | 'marketplace'>('all');
  let similarityThreshold = $state(0.5); // Minimum similarity score (0-1)
  
  interface SimilarConstitution {
    id: string;
    title: string;
    similarity: number; // 0-1 value
    author: string;
    description?: string;
    excerpt?: string;
    tags?: string[];
    source: 'local' | 'marketplace';
    isStarred?: boolean;
  }
  
  // If we have a source ID, use it for the comparison basis
  const { sourceId = null } = $props<{ sourceId?: string | null }>();
  
  onMount(async () => {
    // Update the selectedSourceId with the prop value
    selectedSourceId = sourceId;
    
    // Try to load it as a user constitution if available
    if (sourceId) {
      const userConstitution = constitutionStore.localConstitutions.find(
        c => c.localStorageKey === sourceId
      );
      
      if (userConstitution) {
        await loadSimilarConstitutions(userConstitution.text);
      } else {
        // If not found locally, try to fetch from backend
        await loadSimilarConstituionsById(sourceId);
      }
    } else {
      // If no source ID, show a selection UI or use most recent user constitution
      const recentConstitutions = [...constitutionStore.localConstitutions]
        .sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime());
      
      if (recentConstitutions.length > 0) {
        selectedSourceId = recentConstitutions[0].localStorageKey;
        await loadSimilarConstitutions(recentConstitutions[0].text);
      } else {
        error = "No constitutions found to use as comparison basis.";
        isLoading = false;
      }
    }
  });
  
  // Function to load similar constitutions based on text content
  async function loadSimilarConstitutions(text: string) {
    isLoading = true;
    error = null;
    
    try {
      // In real implementation, call API endpoint with text for semantic comparison
      // For now, using a simulated API response
      const response = await fetchSimilarConstitutions(text);
      similarConstitutions = response;
      
      // Apply filter and threshold
      applyFilters();
    } catch (err) {
      console.error('Error fetching similar constitutions:', err);
      error = `Failed to find similar constitutions: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isLoading = false;
    }
  }
  
  // Function to load similar constitutions by ID
  async function loadSimilarConstituionsById(id: string) {
    isLoading = true;
    error = null;
    
    try {
      // In real implementation, call API endpoint with ID
      // For now, using a simulated API response
      const response = await fetchSimilarConstitutionsById(id);
      similarConstitutions = response;
      
      // Apply filter and threshold
      applyFilters();
    } catch (err) {
      console.error('Error fetching similar constitutions by ID:', err);
      error = `Failed to find similar constitutions: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isLoading = false;
    }
  }
  
  // Function to view constitution details
  async function viewConstitutionDetails(constitution: SimilarConstitution) {
    selectedConstitution = constitution;
    contentIsLoading = true;
    
    try {
      // In a real implementation, this would fetch content based on the source
      if (constitution.source === 'local') {
        const localConst = constitutionStore.localConstitutions.find(c => c.localStorageKey === constitution.id);
        selectedConstitutionContent = localConst?.text || "Content not found";
      } else {
        // Fetch from API
        selectedConstitutionContent = await fetchConstitutionContent(constitution.id);
      }
      showInfoModal = true;
    } catch (err) {
      console.error('Error loading constitution content:', err);
      error = `Failed to load content: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      contentIsLoading = false;
    }
  }
  
  // Function to fork a constitution (copy to user's local constitutions)
  function forkConstitution(constitution: SimilarConstitution, event: MouseEvent) {
    event.stopPropagation();
    
    if (constitution.source === 'marketplace' && selectedConstitutionContent) {
      constitutionStore.addItem(
        `Fork of ${constitution.title}`,
        selectedConstitutionContent
      );
      
      // Show confirmation
      alert(`Successfully forked "${constitution.title}" to your local constitutions.`);
    }
  }
  
  // Function to toggle star on a constitution
  function toggleStar(constitution: SimilarConstitution, event: MouseEvent) {
    event.stopPropagation();
    
    // Update local state immediately for responsive UI
    constitution.isStarred = !constitution.isStarred;
    similarConstitutions = [...similarConstitutions]; // Force reactivity
    
    // In a real implementation, this would call the API to update star status
    console.log(`${constitution.isStarred ? 'Starred' : 'Unstarred'} constitution: ${constitution.id}`);
  }
  
  // Function to apply filters and threshold
  function applyFilters() {
    // Copy original list
    let filtered = [...similarConstitutions];
    
    // Apply source filter
    if (filterSource === 'mine') {
      filtered = filtered.filter(c => c.source === 'local');
    } else if (filterSource === 'marketplace') {
      filtered = filtered.filter(c => c.source === 'marketplace');
    }
    
    // Apply similarity threshold
    filtered = filtered.filter(c => c.similarity >= similarityThreshold);
    
    // Sort by similarity (highest first)
    filtered = filtered.sort((a, b) => b.similarity - a.similarity);
    
    // Update the list
    similarConstitutions = filtered;
  }
  
  // Function to format similarity as percentage
  function formatSimilarity(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
  
  // Watch for filter changes
  $effect(() => {
    if (!isLoading) {
      applyFilters();
    }
  });
</script>

<div class="similar-constitutions">
  <h2>Constitutions Similar to Yours</h2>
  
  <div class="similarity-intro">
    <p>These constitutions share similar concepts, language patterns, or structural elements with your constitution.</p>
  </div>
  
  <div class="filter-controls">
    <div class="source-filter">
      <span class="filter-label">Source:</span>
      <div class="filter-buttons">
        <button 
          class:active={filterSource === 'all'} 
          onclick={() => filterSource = 'all'}
        >
          All
        </button>
        <button 
          class:active={filterSource === 'mine'} 
          onclick={() => filterSource = 'mine'}
        >
          My Constitutions
        </button>
        <button 
          class:active={filterSource === 'marketplace'} 
          onclick={() => filterSource = 'marketplace'}
        >
          Marketplace
        </button>
      </div>
    </div>
    
    <div class="threshold-filter">
      <span class="filter-label">Minimum Similarity: {formatSimilarity(similarityThreshold)}</span>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.05" 
        bind:value={similarityThreshold} 
      />
    </div>
  </div>
  
  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Finding similar constitutions...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <button class="retry-button" onclick={() => loadSimilarConstituionsById(selectedSourceId || '')}>Retry</button>
    </div>
  {:else if similarConstitutions.length === 0}
    <div class="empty-state">
      <p>No similar constitutions found matching your criteria.</p>
      <p>Try adjusting the similarity threshold or changing filters.</p>
    </div>
  {:else}
    <div class="similarity-metrics">
      <p class="metrics-intro">Found <strong>{similarConstitutions.length}</strong> constitutions with at least <strong>{formatSimilarity(similarityThreshold)}</strong> similarity.</p>
      
      <div class="similarity-distribution">
        <div class="bracket high">
          <span class="bracket-label">High Similarity (80-100%)</span>
          <span class="bracket-count">{similarConstitutions.filter(c => c.similarity >= 0.8).length}</span>
        </div>
        <div class="bracket medium">
          <span class="bracket-label">Medium Similarity (60-79%)</span>
          <span class="bracket-count">{similarConstitutions.filter(c => c.similarity >= 0.6 && c.similarity < 0.8).length}</span>
        </div>
        <div class="bracket low">
          <span class="bracket-label">Low Similarity (< 60%)</span>
          <span class="bracket-count">{similarConstitutions.filter(c => c.similarity < 0.6).length}</span>
        </div>
      </div>
    </div>
    
    <div class="constitution-list">
      {#each similarConstitutions as constitution (constitution.id)}
        <div class="constitution-card" onclick={() => viewConstitutionDetails(constitution)}>
          <div class="similarity-badge" class:high={constitution.similarity >= 0.8} class:medium={constitution.similarity >= 0.6 && constitution.similarity < 0.8} class:low={constitution.similarity < 0.6}>
            {formatSimilarity(constitution.similarity)}
          </div>
          <h3>{constitution.title}</h3>
          <div class="source-badge {constitution.source}">
            {constitution.source === 'local' ? 'Your Constitution' : 'Marketplace'}
          </div>
          <div class="author">By: {constitution.author}</div>
          {#if constitution.description}
            <p class="description">{constitution.description}</p>
          {/if}
          {#if constitution.excerpt}
            <div class="excerpt">
              <h4>Excerpt:</h4>
              <p>{constitution.excerpt}</p>
            </div>
          {/if}
          {#if constitution.tags && constitution.tags.length > 0}
            <div class="tags">
              {#each constitution.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}
          <div class="card-actions">
            <button 
              class="info-button" 
              title="View full details" 
              onclick={(e) => { e.stopPropagation(); viewConstitutionDetails(constitution); }}
            >
              <IconInfo /> Details
            </button>
            {#if constitution.source === 'marketplace'}
              <button 
                class="fork-button" 
                title="Fork this constitution" 
                onclick={(e) => forkConstitution(constitution, e)}
              >
                <IconCopy /> Fork
              </button>
            {/if}
            <button 
              class="star-button" 
              title={constitution.isStarred ? "Remove star" : "Add star"} 
              onclick={(e) => toggleStar(constitution, e)}
            >
              {#if constitution.isStarred}
                <IconStarFilled class="starred" />
              {:else}
                <IconStar />
              {/if}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showInfoModal && selectedConstitution}
  <ConstitutionInfoModal
    title={selectedConstitution.title}
    description={`Similarity: ${formatSimilarity(selectedConstitution.similarity)} | Source: ${selectedConstitution.source === 'local' ? 'Your Constitution' : 'Marketplace'}`}
    content={selectedConstitutionContent || ''}
    isLoading={contentIsLoading}
    constitutionId={selectedConstitution.id}
    onClose={() => showInfoModal = false}
  />
{/if}

<style lang="scss">
  @use '../styles/mixins' as *;

  .similar-constitutions {
    padding: var(--space-md);
    max-width: 1200px;
    margin: 0 auto;
  }
  
  h2 {
    font-size: 2rem;
    font-weight: 400;
    margin-bottom: var(--space-md);
    color: var(--text-primary);
  }
  
  .similarity-intro {
    margin-bottom: var(--space-md);
    
    p {
      font-size: 1.1rem;
      color: var(--text-secondary);
    }
  }
  
  .filter-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
    gap: var(--space-md);
    padding: var(--space-md);
    background-color: var(--bg-elevated);
    border-radius: var(--radius-lg);
    
    .filter-label {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-right: var(--space-sm);
    }
    
    .filter-buttons {
      display: flex;
      gap: var(--space-xs);
      
      button {
        padding: 6px 12px;
        background-color: var(--bg-surface);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        cursor: pointer;
        
        &.active {
          background-color: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        
        &:hover:not(.active) {
          background-color: var(--bg-hover);
        }
      }
    }
    
    .threshold-filter {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      min-width: 200px;
      
      input[type="range"] {
        accent-color: var(--primary);
      }
    }
  }
  
  .loading-state, .error-state, .empty-state {
    text-align: center;
    padding: var(--space-xl);
    margin-top: var(--space-lg);
    background-color: var(--bg-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--input-border);
    
    p {
      color: var(--text-secondary);
      margin-bottom: var(--space-md);
    }
    
    .spinner {
      @include loading-spinner($size: 40px);
      margin: 0 auto var(--space-md);
    }
    
    .retry-button {
      padding: 8px 16px;
      background-color: var(--primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      
      &:hover {
        background-color: var(--primary-light);
      }
    }
  }
  
  .similarity-metrics {
    margin-bottom: var(--space-lg);
    
    .metrics-intro {
      font-size: 1.1rem;
      margin-bottom: var(--space-md);
    }
    
    .similarity-distribution {
      display: flex;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
      
      .bracket {
        flex: 1;
        padding: var(--space-md);
        border-radius: var(--radius-md);
        display: flex;
        flex-direction: column;
        align-items: center;
        
        &.high {
          background-color: var(--success-bg);
          border: 1px solid var(--success);
        }
        
        &.medium {
          background-color: var(--warning-bg);
          border: 1px solid var(--warning);
        }
        
        &.low {
          background-color: var(--error-bg);
          border: 1px solid var(--error);
        }
        
        .bracket-label {
          font-size: 0.9rem;
          margin-bottom: var(--space-xs);
        }
        
        .bracket-count {
          font-size: 1.5rem;
          font-weight: bold;
        }
      }
    }
  }
  
  .constitution-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: var(--space-md);
  }
  
  .constitution-card {
    @include base-card();
    padding: var(--space-md);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    
    h3 {
      margin-top: var(--space-sm);
      margin-bottom: var(--space-xs);
      font-size: 1.2rem;
      color: var(--text-primary);
      padding-right: 80px; // Make room for similarity badge
    }
    
    .author {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: var(--space-sm);
    }
    
    .description {
      font-size: 0.95rem;
      color: var(--text-secondary);
      margin-bottom: var(--space-md);
    }
    
    .excerpt {
      background-color: var(--bg-elevated);
      padding: var(--space-sm);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-md);
      
      h4 {
        font-size: 0.9rem;
        font-weight: 600;
        margin-bottom: var(--space-xs);
      }
      
      p {
        font-size: 0.85rem;
        font-style: italic;
      }
    }
    
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-md);
      
      .tag {
        font-size: 0.75rem;
        background-color: var(--bg-elevated);
        color: var(--text-secondary);
        padding: 2px 8px;
        border-radius: var(--radius-pill);
      }
    }
    
    .similarity-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 8px;
      border-radius: var(--radius-pill);
      font-size: 0.8rem;
      font-weight: 600;
      
      &.high {
        background-color: var(--success);
        color: white;
      }
      
      &.medium {
        background-color: var(--warning);
        color: white;
      }
      
      &.low {
        background-color: var(--error);
        color: white;
      }
    }
    
    .source-badge {
      display: inline-block;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      margin-bottom: var(--space-xs);
      
      &.local {
        background-color: var(--primary-lightest);
        color: var(--primary);
      }
      
      &.marketplace {
        background-color: var(--secondary-lightest);
        color: var(--secondary);
      }
    }
    
    .card-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
      margin-top: var(--space-sm);
    }
    
    .info-button, .fork-button, .star-button {
      @include icon-button($padding: 6px 12px);
      display: flex;
      align-items: center;
      gap: 6px;
      
      &:hover {
        background-color: var(--bg-hover);
      }
    }
    
    .star-button {
      .starred {
        color: var(--warning);
      }
    }
  }
</style>