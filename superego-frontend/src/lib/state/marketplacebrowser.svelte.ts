<script lang="ts">
    import { onMount } from 'svelte';
    import { fetchMarketplaceConstitutions, fetchTags } from '$lib/api/rest.svelte';
    import IconStar from '~icons/fluent/star-24-regular';
    import IconStarFilled from '~icons/fluent/star-24-filled';
    import IconDownload from '~icons/fluent/arrow-download-24-regular';
    import IconFilter from '~icons/fluent/filter-24-regular';
    import IconSearch from '~icons/fluent/search-24-regular';
    import IconClear from '~icons/fluent/dismiss-24-regular';
    import IconAdvanced from '~icons/fluent/options-24-regular';
    import IconGraph from '~icons/fluent/data-trending-24-regular';
    import ConstitutionInfoModal from './ConstitutionInfoModal.svelte';
    import ConstitutionRelationshipGraph from './ConstitutionRelationshipGraph.svelte';
    
    // --- Component State ---
    let isLoading = $state(true);
    let isLoadingTags = $state(true);
    let error = $state<string | null>(null);
    let marketplaceConstitutions = $state<MarketplaceConstitution[]>([]);
    let searchQuery = $state('');
    let selectedTags = $state<string[]>([]);
    let availableTags = $state<{tag: string, count: number}[]>([]);
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
    
    // Advanced search state
    let showAdvancedSearch = $state(false);
    let authorFilter = $state('');
    let dateRangeStart = $state('');
    let dateRangeEnd = $state('');
    let minStars = $state(0);
    let maxStars = $state(1000);
    let semanticSearch = $state(false);
    let showGraphView = $state(false);
    let selectedConstitutionId = $state<string | null>(null);
    
    interface MarketplaceConstitution {
        id: string;
        title: string;
        description?: string;
        author?: string;
        tags: string[];
        createdAt: string;
        analytics: ConstitutionAnalytics;
        isStarredByUser?: boolean;
    }
    
    // Computed state for filtered constitutions
    let filteredConstitutions = $derived(() => {
        if (!marketplaceConstitutions.length) return [];
        
        let filtered = [...marketplaceConstitutions];
        
        // Basic text search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(constitution => 
                constitution.title.toLowerCase().includes(query) || 
                (constitution.description && constitution.description.toLowerCase().includes(query)) ||
                (semanticSearch && constitution.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        }
        
        // Tag filtering
        if (selectedTags.length > 0) {
            filtered = filtered.filter(constitution => 
                selectedTags.every(tag => constitution.tags.includes(tag))
            );
        }
        
        // Advanced filters
        if (showAdvancedSearch) {
            // Author filter
            if (authorFilter) {
                const authorQuery = authorFilter.toLowerCase();
                filtered = filtered.filter(constitution => 
                    constitution.author && constitution.author.toLowerCase().includes(authorQuery)
                );
            }
            
            // Date range
            if (dateRangeStart) {
                const startDate = new Date(dateRangeStart);
                filtered = filtered.filter(constitution => 
                    new Date(constitution.createdAt) >= startDate
                );
            }
            
            if (dateRangeEnd) {
                const endDate = new Date(dateRangeEnd);
                filtered = filtered.filter(constitution => 
                    new Date(constitution.createdAt) <= endDate
                );
            }
            
            // Star count
            filtered = filtered.filter(constitution => 
                constitution.analytics.stars >= minStars && 
                constitution.analytics.stars <= maxStars
            );
        }
        
        // Apply sorting
        switch (sortBy) {
            case 'popular':
                return filtered.sort((a, b) => 
                    (b.analytics.stars || 0) - (a.analytics.stars || 0)
                );
            case 'recent':
                return filtered.sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            case 'alphabetical':
                return filtered.sort((a, b) => 
                    a.title.localeCompare(b.title)
                );
            default:
                return filtered;
        }
    });
    
    // Function to toggle a tag selection
    function toggleTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(t => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
    }
    
    // Function to toggle star on a constitution
    function toggleStar(constitutionId: string, event: MouseEvent) {
        event.stopPropagation();
        
        // Find the constitution
        const constitution = marketplaceConstitutions.find(c => c.id === constitutionId);
        if (!constitution) return;
        
        // Toggle the star state
        constitution.isStarredByUser = !constitution.isStarredByUser;
        constitution.analytics.stars += constitution.isStarredByUser ? 1 : -1;
        
        // Force reactivity by recreating the array
        marketplaceConstitutions = [...marketplaceConstitutions];
        
        // In a real implementation, this would call the API
        console.log(`Toggled star for constitution: ${constitutionId} - now ${constitution.isStarredByUser ? 'starred' : 'unstarred'}`);
    }
    
    // Function to view constitution details
    async function viewConstitutionDetails(constitution: MarketplaceConstitution) {
        selectedConstitutionId = constitution.id;
        
        try {
            // In a real implementation, this would fetch the full content
            // For now, let's use a placeholder
            modalData = {
                title: constitution.title,
                description: constitution.description,
                content: `This is where the full content of "${constitution.title}" would be displayed. In a real implementation, this would be fetched from the API.`,
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
    
    // Function to format date
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
    
    // Function to clear all filters
    function clearFilters() {
        searchQuery = '';
        selectedTags = [];
        authorFilter = '';
        dateRangeStart = '';
        dateRangeEnd = '';
        minStars = 0;
        maxStars = 1000;
        semanticSearch = false;
    }
    
    // Function to toggle graph view
    function toggleGraphView() {
        showGraphView = !showGraphView;
    }
    
    onMount(async () => {
        try {
            // Load tags first for faster UI rendering
            const tags = await fetchTags();
            availableTags = tags;
            isLoadingTags = false;
            
            // Then load constitutions
            const constitutions = await fetchMarketplaceConstitutions();
            marketplaceConstitutions = constitutions;
            
            // Update max stars based on data
            if (constitutions.length > 0) {
                const maxStarsValue = Math.max(...constitutions.map(c => c.analytics.stars));
                maxStars = maxStarsValue > 0 ? maxStarsValue : 1000;
            }
        } catch (err) {
            console.error('Error loading marketplace data:', err);
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
    
    <div class="view-toggle">
        <button 
            class:active={!showGraphView} 
            onclick={() => showGraphView = false}
        >
            List View
        </button>
        <button 
            class:active={showGraphView} 
            onclick={() => showGraphView = true}
        >
            <IconGraph /> Relationship Graph
        </button>
    </div>
    
    {#if !showGraphView}
        <div class="controls">
            <div class="search-box">
                <IconSearch class="search-icon" />
                <input 
                    type="text" 
                    bind:value={searchQuery} 
                    placeholder="Search constitutions..." 
                    class="search-input"
                />
                {#if searchQuery}
                    <button class="clear-search" onclick={() => searchQuery = ''}>
                        <IconClear />
                    </button>
                {/if}
            </div>
            
            <div class="filter-sort">
                <div class="filter-dropdown">
                    <button class="filter-button" onclick={() => showAdvancedSearch = !showAdvancedSearch}>
                        <IconAdvanced /> Advanced {showAdvancedSearch ? 'v' : '>'}
                    </button>
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
        
        {#if showAdvancedSearch}
            <div class="advanced-search">
                <div class="advanced-search-form">
                    <div class="form-row">
                        <label for="author-filter">Author:</label>
                        <input 
                            type="text" 
                            id="author-filter" 
                            bind:value={authorFilter} 
                            placeholder="Filter by author..."
                        />
                    </div>
                    
                    <div class="form-row date-range">
                        <label>Date Range:</label>
                        <div class="date-inputs">
                            <input 
                                type="date" 
                                bind:value={dateRangeStart} 
                                placeholder="From"
                            />
                            <span>to</span>
                            <input 
                                type="date" 
                                bind:value={dateRangeEnd} 
                                placeholder="To"
                            />
                        </div>
                    </div>
                    
                    <div class="form-row stars-range">
                        <label>Stars Range: {minStars} - {maxStars}</label>
                        <div class="range-inputs">
                            <input 
                                type="range" 
                                bind:value={minStars} 
                                min="0" 
                                max={maxStars} 
                            />
                            <input 
                                type="range" 
                                bind:value={maxStars} 
                                min={minStars} 
                                max="1000" 
                            />
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <label class="checkbox-label">
                            <input type="checkbox" bind:checked={semanticSearch} />
                            Enable semantic search (matches concepts and similar terms)
                        </label>
                    </div>
                </div>
                
                <div class="advanced-search-actions">
                    <button class="clear-button" onclick={clearFilters}>
                        Clear All Filters
                    </button>
                </div>
            </div>
        {/if}
        
        <div class="tags-container">
            <h3 class="tags-title">Tags {selectedTags.length > 0 ? `(${selectedTags.length} selected)` : ''}</h3>
            <div class="tags-list">
                {#if isLoadingTags}
                    <div class="loading-tags">Loading tags...</div>
                {:else if availableTags.length === 0}
                    <div class="empty-tags">No tags available</div>
                {:else}
                    {#each availableTags as tagData}
                        <button 
                            class="tag-button" 
                            class:selected={selectedTags.includes(tagData.tag)} 
                            onclick={() => toggleTag(tagData.tag)}
                        >
                            {tagData.tag} <span class="tag-count">({tagData.count})</span>
                        </button>
                    {/each}
                {/if}
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
                {#if searchQuery || selectedTags.length > 0 || authorFilter || dateRangeStart || dateRangeEnd || minStars > 0 || maxStars < 1000}
                    <button class="clear-filters" onclick={clearFilters}>
                        Clear All Filters
                    </button>
                {/if}
            </div>
        {:else}
            <div class="results-summary">
                Found <strong>{filteredConstitutions.length}</strong> constitution{filteredConstitutions.length !== 1 ? 's' : ''} matching your criteria.
            </div>
            
            <div class="constitution-grid">
                {#each filteredConstitutions as constitution (constitution.id)}
                    <div class="constitution-card" onclick={() => viewConstitutionDetails(constitution)}>
                        <div class="card-header">
                            <h3 class="card-title">{constitution.title}</h3>
                            <button 
                                class="star-button" 
                                onclick={(e) => toggleStar(constitution.id, e)}
                                title={constitution.isStarredByUser ? "Remove star" : "Add star"}
                            >
                                {#if constitution.isStarredByUser}
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
    {:else}
        <!-- Graph View -->
        <div class="graph-view-container">
            <div class="graph-intro">
                <h3>Constitution Relationship Graph</h3>
                <p>This visualization shows how constitutions in the marketplace relate to each other through derivation, similarity, and references.</p>
            </div>
            <div class="graph-area">
                <ConstitutionRelationshipGraph 
                    constitutionId={selectedConstitutionId} 
                    width={1000} 
                    height={600}
                />
            </div>
        </div>
    {/if}
</div>

{#if showModal && modalData}
    <ConstitutionInfoModal
        title={modalData.title}
        description={modalData.description}
        content={modalData.content}
        constitutionId={selectedConstitutionId}
        onClose={() => showModal = false}
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
    
    .view-toggle {
        display: flex;
        justify-content: center;
        gap: var(--space-sm);
        margin-bottom: var(--space-lg);
        
        button {
            padding: 8px 16px;
            background-color: var(--bg-surface);
            border: 1px solid var(--input-border);
            border-radius: var(--radius-md);
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            
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

    .controls {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        margin-bottom: var(--space-md);
        
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
        
        .clear-search {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px;
            
            &:hover {
                color: var(--text-primary);
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
    }
    
    .advanced-search {
        @include base-card($bg: var(--bg-elevated));
        margin-bottom: var(--space-lg);
        padding: var(--space-md);
        
        .advanced-search-form {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: var(--space-md);
        }
        
        .form-row {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
            
            label {
                font-size: 0.9rem;
                color: var(--text-secondary);
            }
            
            input[type="text"], input[type="date"] {
                padding: 8px 12px;
                border: 1px solid var(--input-border);
                border-radius: var(--radius-sm);
                background-color: var(--bg-surface);
            }
            
            input[type="range"] {
                accent-color: var(--primary);
            }
        }
        
        .date-inputs, .range-inputs {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
        }
        
        .checkbox-label {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
            
            input[type="checkbox"] {
                accent-color: var(--primary);
            }
        }
        
        .advanced-search-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: var(--space-md);
            
            .clear-button {
                padding: 6px 12px;
                background-color: var(--bg-surface);
                border: 1px solid var(--input-border);
                border-radius: var(--radius-sm);
                font-size: 0.9rem;
                cursor: pointer;
                
                &:hover {
                    background-color: var(--bg-hover);
                }
            }
        }
    }

    .tags-container {
        margin-bottom: var(--space-lg);
        
        .tags-title {
            font-size: 1.1rem;
            margin-bottom: var(--space-sm);
            font-weight: 600;
        }
        
        .tags-list {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-xs);
            
            .tag-button {
                padding: 6px 12px;
                background-color: var(--bg-surface);
                border: 1px solid var(--input-border);
                border-radius: var(--radius-pill);
                font-size: 0.9rem;
                cursor: pointer;
                
                &.selected {
                    background-color: var(--primary);
                    color: white;
                    border-color: var(--primary);
                }
                
                &:hover:not(.selected) {
                    background-color: var(--bg-hover);
                }
                
                .tag-count {
                    font-size: 0.8rem;
                    color: inherit;
                    opacity: 0.8;
                }
            }
            
            .loading-tags, .empty-tags {
                padding: var(--space-md);
                color: var(--text-secondary);
                font-style: italic;
            }
        }
    }

    .loading-state, .error-state, .empty-state {
        text-align: center;
        padding: var(--space-xl);
        
        p {
            color: var(--text-secondary);
            margin-bottom: var(--space-md);
        }
        
        .spinner {
            @include loading-spinner($size: 40px);
            margin: 0 auto var(--space-md);
        }
        
        .retry-button, .clear-filters {
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
    }
    
    .results-summary {
        margin-bottom: var(--space-md);
        font-size: 1rem;
        color: var(--text-secondary);
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
                font-size: 1.1rem;
                color: var(--text-primary);
            }
            
            .stat-label {
                font-size: 0.7rem;
                color: var(--text-secondary);
            }
        }
    }
    
    .graph-view-container {
        @include base-card($bg: var(--bg-surface));
        padding: var(--space-md);
        margin-bottom: var(--space-lg);
        
        .graph-intro {
            margin-bottom: var(--space-md);
            
            h3 {
                font-size: 1.2rem;
                margin-bottom: var(--space-xs);
            }
            
            p {
                font-size: 0.9rem;
                color: var(--text-secondary);
            }
        }
        
        .graph-area {
            height: 600px;
            border: 1px solid var(--input-border);
            border-radius: var(--radius-sm);
            overflow: hidden;
        }
    }
</style>