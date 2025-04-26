<script lang="ts">
    import { onMount } from 'svelte';
    import { fetchMarketplaceConstitutions } from '$lib/api/rest.svelte';
    import IconStar from '~icons/fluent/star-24-regular';
    import IconStarFilled from '~icons/fluent/star-24-filled';
    import IconDownload from '~icons/fluent/arrow-download-24-regular';
    import IconFilter from '~icons/fluent/filter-24-regular';
    import IconSearch from '~icons/fluent/search-24-regular';
    import ConstitutionInfoModal from './ConstitutionInfoModal.svelte';
    
    // --- Component State ---
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let marketplaceConstitutions = $state<MarketplaceConstitution[]>([]);
    let searchQuery = $state('');
    let selectedTags = $state<string[]>([]);
    let sortBy = $state<'popular' | 'recent' | 'alphabetical'>('popular');
    let showModal = $state(false);
    let modalData = $state<{
        title: string;
        description?: string;
        content?: string;
        author?: string;
        tags?: string[];
        analytics?: ConstitutionAnalytics;
    } | null>(null);
    
    interface MarketplaceConstitution {
        id: string;
        title: string;
        description?: string;
        author?: string;
        tags: string[];
        createdAt: string;
        analytics: ConstitutionAnalytics;
    }
    
    // --- All available tags from constitutions ---
    let allTags = $derived(() => {
        const tagSet = new Set<string>();
        marketplaceConstitutions.forEach(constitution => {
            constitution.tags.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    });
    
    // --- Filtered and sorted constitutions ---
    let filteredConstitutions = $derived(() => {
        let result = [...marketplaceConstitutions];
        
        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(constitution => 
                constitution.title.toLowerCase().includes(query) || 
                (constitution.description && constitution.description.toLowerCase().includes(query))
            );
        }
        
        // Apply tag filters
        if (selectedTags.length > 0) {
            result = result.filter(constitution => 
                selectedTags.every(tag => constitution.tags.includes(tag))
            );
        }
        
        // Apply sorting
        switch (sortBy) {
            case 'popular':
                return result.sort((a, b) => 
                    (b.analytics.stars || 0) - (a.analytics.stars || 0)
                );
            case 'recent':
                return result.sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            case 'alphabetical':
                return result.sort((a, b) => 
                    a.title.localeCompare(b.title)
                );
            default:
                return result;
        }
    });
    
    function toggleTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(t => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
    }
    
    function toggleStar(constitutionId: string, event: MouseEvent) {
        event.stopPropagation();
        // Implementation would interact with the backend to star/unstar
        console.log('Toggling star for constitution:', constitutionId);
        // For now, let's just toggle it in the UI
        marketplaceConstitutions = marketplaceConstitutions.map(c => {
            if (c.id === constitutionId) {
                const newStarCount = c.analytics.stars + (c.analytics.isStarredByUser ? -1 : 1);
                return {
                    ...c,
                    analytics: {
                        ...c.analytics,
                        stars: newStarCount,
                        isStarredByUser: !c.analytics.isStarredByUser
                    }
                };
            }
            return c;
        });
    }
    
    async function viewConstitutionDetails(constitution: MarketplaceConstitution) {
        try {
            // In a real implementation, we would fetch the full content here
            // For now, let's create a placeholder
            modalData = {
                title: constitution.title,
                description: constitution.description,
                content: `This is where the full content of "${constitution.title}" would be displayed.`,
                author: constitution.author,
                tags: constitution.tags,
                analytics: constitution.analytics
            };
            showModal = true;
        } catch (err) {
            console.error('Error loading constitution details:', err);
            error = `Failed to load details: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    function formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (e) {
            return dateString;
        }
    }
    
    onMount(async () => {
        try {
            // In a real implementation, this would fetch from the backend
            // For now, let's create some test data
            const mockData: MarketplaceConstitution[] = [
                {
                    id: 'constitution-1',
                    title: 'Basic AI Safety Guidelines',
                    description: 'Core principles for ensuring AI systems operate safely and ethically.',
                    author: 'AI Safety Institute',
                    tags: ['safety', 'ethics', 'guidelines'],
                    createdAt: '2025-03-15T14:22:33Z',
                    analytics: {
                        views: 1520,
                        downloads: 345,
                        uses: 122,
                        stars: 87,
                        isStarredByUser: false
                    }
                },
                {
                    id: 'constitution-2',
                    title: 'Corporate Governance Framework',
                    description: 'Ethical guidelines tailored for AI systems in corporate environments.',
                    author: 'Business Ethics Group',
                    tags: ['corporate', 'governance', 'ethics'],
                    createdAt: '2025-02-28T09:12:45Z',
                    analytics: {
                        views: 980,
                        downloads: 210,
                        uses: 75,
                        stars: 42,
                        isStarredByUser: true
                    }
                },
                {
                    id: 'constitution-3',
                    title: 'Creative Assistant Guidelines',
                    description: 'Rules for AI systems that assist with creative tasks like writing and design.',
                    author: 'Creative Commons',
                    tags: ['creativity', 'guidelines', 'assistance'],
                    createdAt: '2025-03-22T16:40:19Z',
                    analytics: {
                        views: 2300,
                        downloads: 550,
                        uses: 310,
                        stars: 156,
                        isStarredByUser: false
                    }
                }
            ];
            
            // Simulate an API call
            await new Promise(resolve => setTimeout(resolve, 800));
            marketplaceConstitutions = mockData;
        } catch (err) {
            console.error('Error loading marketplace constitutions:', err);
            error = `Failed to load marketplace: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="marketplace-browser">
    <div class="header">
        <h1>Constitution Marketplace</h1>
        <p class="subtitle">Browse and discover community-approved constitutions</p>
    </div>
    
    <div class="controls">
        <div class="search-box">
            <IconSearch class="search-icon" />
            <input 
                type="text" 
                bind:value={searchQuery} 
                placeholder="Search constitutions..." 
                class="search-input"
            />
        </div>
        
        <div class="filter-sort">
            <div class="filter-dropdown">
                <button class="filter-button" aria-haspopup="true" aria-expanded="false">
                    <IconFilter /> Filter by Tags {selectedTags.length > 0 ? `(${selectedTags.length})` : ''}
                </button>
                <div class="dropdown-content tags-dropdown">
                    {#if allTags.length === 0}
                        <div class="empty-tags">No tags available</div>
                    {:else}
                        {#each allTags as tag}
                            <label class="tag-checkbox">
                                <input 
                                    type="checkbox" 
                                    checked={selectedTags.includes(tag)} 
                                    onchange={() => toggleTag(tag)} 
                                />
                                <span>{tag}</span>
                            </label>
                        {/each}
                    {/if}
                </div>
            </div>
            
            <div class="sort-control">
                <label for="sort-select">Sort by:</label>
                <select id="sort-select" bind:value={sortBy}>
                    <option value="popular">Most Popular</option>
                    <option value="recent">Most Recent</option>
                    <option value="alphabetical">Alphabetical</option>
                </select>
            </div>
        </div>
    </div>
    
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading marketplace...</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p>Error: {error}</p>
            <button class="retry-button" onclick={() => window.location.reload()}>Retry</button>
        </div>
    {:else if filteredConstitutions.length === 0}
        <div class="empty-state">
            <p>No constitutions found matching your criteria.</p>
            {#if searchQuery || selectedTags.length > 0}
                <button class="clear-filters" onclick={() => { searchQuery = ''; selectedTags = []; }}>
                    Clear Filters
                </button>
            {/if}
        </div>
    {:else}
        <div class="constitution-grid">
            {#each filteredConstitutions as constitution (constitution.id)}
                <div class="constitution-card" onclick={() => viewConstitutionDetails(constitution)}>
                    <div class="card-header">
                        <h3 class="card-title">{constitution.title}</h3>
                        <button 
                            class="star-button" 
                            onclick={(e) => toggleStar(constitution.id, e)}
                            title={constitution.analytics.isStarredByUser ? "Remove star" : "Add star"}
                        >
                            {#if constitution.analytics.isStarredByUser}
                                <IconStarFilled class="star-filled" />
                            {:else}
                                <IconStar class="star-outline" />
                            {/if}
                            <span class="star-count">{constitution.analytics.stars}</span>
                        </button>
                    </div>
                    
                    {#if constitution.description}
                        <p class="card-description">{constitution.description}</p>
                    {/if}
                    
                    <div class="card-meta">
                        {#if constitution.author}
                            <div class="author">By: {constitution.author}</div>
                        {/if}
                        <div class="date">Added: {formatDate(constitution.createdAt)}</div>
                    </div>
                    
                    <div class="card-tags">
                        {#each constitution.tags as tag}
                            <span class="tag">{tag}</span>
                        {/each}
                    </div>
                    
                    <div class="card-stats">
                        <div class="stat">
                            <span class="stat-value">{constitution.analytics.views}</span>
                            <span class="stat-label">Views</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">{constitution.analytics.downloads}</span>
                            <span class="stat-label">Downloads</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">{constitution.analytics.uses}</span>
                            <span class="stat-label">Uses</span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal && modalData}
    <ConstitutionInfoModal
        title={modalData.title}
        description={modalData.description}
        content={modalData.content}
        onClose={() => (showModal = false)}
    />
{/if}

<style lang="scss">
    @use '../styles/mixins' as *;

    .marketplace-browser {
        padding: var(--space-md);
        max-width: 1200px;
        margin: 0 auto;
    }

    .header {
        margin-bottom: var(--space-lg);
        text-align: center;
        
        h1 {
            font-size: 1.8rem;
            color: var(--text-primary);
            margin-bottom: var(--space-xs);
        }
        
        .subtitle {
            color: var(--text-secondary);
            font-size: 1rem;
        }
    }

    .controls {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
        
        @media (min-width: 768px) {
            flex-direction: row;
            align-items: center;
        }
    }

    .search-box {
        position: relative;
        flex-grow: 1;
        
        .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-secondary);
        }
        
        .search-input {
            width: 100%;
            padding: 10px 12px 10px 40px;
            border: 1px solid var(--input-border);
            border-radius: var(--radius-md);
            font-size: 0.95rem;
            
            &:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 2px var(--primary-lightest);
            }
        }
    }

    .filter-sort {
        display: flex;
        gap: var(--space-md);
        flex-wrap: wrap;
    }

    .filter-dropdown {
        position: relative;
        
        .filter-button {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
            padding: 8px 12px;
            background-color: var(--bg-surface);
            border: 1px solid var(--input-border);
            border-radius: var(--radius-md);
            cursor: pointer;
            font-size: 0.9rem;
            
            &:hover {
                background-color: var(--bg-hover);
            }
        }
        
        .dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            top: 100%;
            min-width: 200px;
            background-color: var(--bg-surface);
            border: 1px solid var(--input-border);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            z-index: 10;
            margin-top: 4px;
            padding: var(--space-sm);
            max-height: 300px;
            overflow-y: auto;
        }
        
        &:hover .dropdown-content,
        &:focus-within .dropdown-content {
            display: block;
        }
    }

    .tag-checkbox {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        padding: 6px 8px;
        cursor: pointer;
        transition: background-color 0.15s;
        border-radius: var(--radius-sm);
        
        &:hover {
            background-color: var(--bg-hover);
        }
        
        input[type="checkbox"] {
            accent-color: var(--primary);
        }
    }

    .empty-tags {
        padding: var(--space-sm);
        color: var(--text-secondary);
        font-style: italic;
    }

    .sort-control {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        
        label {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }
        
        select {
            padding: 8px 12px;
            border: 1px solid var(--input-border);
            border-radius: var(--radius-md);
            font-size: 0.9rem;
            background-color: var(--bg-surface);
            cursor: pointer;
            
            &:focus {
                outline: none;
                border-color: var(--primary);
            }
        }
    }

    .loading-state, .error-state, .empty-state {
        text-align: center;
        padding: var(--space-xl);
        color: var(--text-secondary);
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--primary-lightest);
        border-top-color: var(--primary);
        border-radius: 50%;
        margin: 0 auto var(--space-md);
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .retry-button, .clear-filters {
        margin-top: var(--space-md);
        padding: 8px 16px;
        background-color: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.9rem;
        
        &:hover {
            background-color: var(--primary-light);
        }
    }

    .constitution-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--space-md);
    }

    .constitution-card {
        @include base-card();
        padding: var(--space-md);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        height: 100%;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: var(--space-sm);
    }

    .card-title {
        font-size: 1.1rem;
        margin: 0;
        color: var(--text-primary);
    }

    .star-button {
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 2px;
        color: var(--text-secondary);
        padding: 4px;
        border-radius: var(--radius-sm);
        
        &:hover {
            background-color: var(--bg-hover);
            color: var(--warning);
        }
        
        .star-filled {
            color: var(--warning);
        }
    }

    .card-description {
        font-size: 0.9rem;
        margin-bottom: var(--space-md);
        color: var(--text-secondary);
        flex-grow: 1;
    }

    .card-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: var(--space-sm);
        font-size: 0.8rem;
        color: var(--text-secondary);
    }

    .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: var(--space-sm);
        
        .tag {
            font-size: 0.75rem;
            background-color: var(--bg-hover);
            color: var(--text-secondary);
            padding: 2px 6px;
            border-radius: var(--radius-pill);
        }
    }

    .card-stats {
        display: flex;
        justify-content: space-between;
        padding-top: var(--space-sm);
        border-top: 1px solid var(--input-border);
        
        .stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            
            .stat-value {
                font-weight: 600;


<script lang="ts">
    // Existing imports
    import ConstitutionRelationshipGraph from './ConstitutionRelationshipGraph.svelte';
    
    // Existing code...
    
    // Add this state variable
    let showRelationshipGraph = $state(false);
    let focusedConstitutionId = $state<string | undefined>(undefined);
    
    // Modify the viewConstitutionDetails function to set the focus ID
    async function viewConstitutionDetails(constitution: MarketplaceConstitution) {
        try {
            focusedConstitutionId = constitution.id;
            // Rest of existing function...
            modalData = {
                title: constitution.title,
                description: constitution.description,
                content: `This is where the full content of "${constitution.title}" would be displayed.`,
                author: constitution.author,
                tags: constitution.tags,
                analytics: constitution.analytics
            };
            showModal = true;
        } catch (err) {
            console.error('Error loading constitution details:', err);
            error = `Failed to load details: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    // Add this function
    function toggleRelationshipGraph() {
        showRelationshipGraph = !showRelationshipGraph;
    }
</script>

<!-- Add this below the controls section but above the constitution grid -->
<div class="view-controls">
    <button 
        class="view-toggle" 
        onclick={toggleRelationshipGraph}
        class:active={showRelationshipGraph}
    >
        {showRelationshipGraph ? 'List View' : 'Relationship Graph'}
    </button>
</div>

<!-- Add the conditional display of graph vs grid -->
{#if isLoading}
    <!-- Existing loading state -->
{:else if error}
    <!-- Existing error state -->
{:else if filteredConstitutions.length === 0}
    <!-- Existing empty state -->
{:else if showRelationshipGraph}
    <div class="graph-view">
        <h3>Constitution Relationships</h3>
        <p class="graph-description">
            This graph shows how constitutions relate to each other through derivation, similarities, and references.
        </p>
        <ConstitutionRelationshipGraph constitutionId={focusedConstitutionId} />
    </div>
{:else}
    <!-- Existing constitution grid -->
    <div class="constitution-grid">
        <!-- Existing grid items -->
    </div>
{/if}

<style lang="scss">
    /* Existing styles */
    
    .view-controls {
        display: flex;
        justify-content: flex-end;
        margin-bottom: var(--space-md);
    }
    
    .view-toggle {
        padding: 8px 16px;
        background-color: var(--bg-surface);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s ease;
        
        &:hover {
            background-color: var(--bg-hover);
        }
        
        &.active {
            background-color: var(--primary);
            color: white;
            border-color: var(--primary);
        }
    }
    
    .graph-view {
        padding: var(--space-md);
        background-color: var(--bg-surface);
        border-radius: var(--radius-lg);
        border: 1px solid var(--input-border);
        
        h3 {
            margin-top: 0;
            margin-bottom: var(--space-sm);
            color: var(--text-primary);
        }
        
        .graph-description {
            margin-bottom: var(--space-md);
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
    }
</style>

<!-- When showing the modal in MarketplaceBrowser.svelte -->
{#if showModal && modalData}
    <ConstitutionInfoModal
        title={modalData.title}
        description={modalData.description}
        content={modalData.content}
        constitutionId={focusedConstitutionId}
        onClose={() => (showModal = false)}
    />
{/if}