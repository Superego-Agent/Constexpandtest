<script lang="ts">
    // Existing imports
    import ConstitutionRelationshipGraph from './ConstitutionRelationshipGraph.svelte';
    
    // Extend the props to support a constitutionId
    let { 
        title = 'Constitution Info',
        description = undefined,
        content = undefined,
        isLoading = false,
        error = null,
        onClose = () => {},
        constitutionId = undefined,
        isInline = false
    } = $props<{
        title?: string;
        description?: string | undefined;
        content?: string | undefined;
        isLoading?: boolean;
        error?: string | null;
        onClose?: () => void;
        constitutionId?: string;
        isInline?: boolean;
    }>();
    
    // Add state for tab selection
    let activeTab = $state<'content' | 'relations'>('content');
</script>

<div class="modal-content" transition:fade={{ duration: 150, delay: 50 }}>
    <button class="close-button" onclick={closeModal} aria-label="Close modal">
        <IconClose />
    </button>
    <h2>{title}</h2>
    {#if description}
        <p class="description"><em>{description}</em></p>
    {/if}

    <hr />

    <!-- Add tabs if we have a constitution ID -->
    {#if constitutionId}
        <div class="tabs">
            <button 
                class="tab" 
                class:active={activeTab === 'content'} 
                onclick={() => activeTab = 'content'}
            >
                Content
            </button>
            <button 
                class="tab" 
                class:active={activeTab === 'relations'} 
                onclick={() => activeTab = 'relations'}
            >
                Relationships
            </button>
        </div>
    {/if}

    <!-- Content tab -->
    {#if !constitutionId || activeTab === 'content'}
        {#if isLoading}
            <div class="loading-indicator">Loading content...</div>
        {:else if error}
            <div class="error-message">Error loading content: {error}</div>
        {:else if content}
            <div class="content-area">{@html parsedHtml}</div>
        {:else}
            <p>No content available.</p>
        {/if}
    {:else if activeTab === 'relations'}
        <div class="graph-container">
            <ConstitutionRelationshipGraph constitutionId={constitutionId} />
        </div>
    {/if}
</div>

<style lang="scss">
    /* Existing styles */
    
    .tabs {
        display: flex;
        border-bottom: 1px solid var(--input-border);
        margin-bottom: var(--space-md);
    }
    
    .tab {
        padding: var(--space-sm) var(--space-md);
        background-color: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: 0.9rem;
        color: var(--text-secondary);
        transition: all 0.2s ease;
        
        &:hover {
            color: var(--text-primary);
        }
        
        &.active {
            color: var(--primary);
            border-bottom-color: var(--primary);
        }
    }
    
    .graph-container {
        height: 350px;
        margin-bottom: var(--space-md);
    }
</style>