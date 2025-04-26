<script lang="ts">
    import { constitutionStore } from '$lib/state/constitutions.svelte';
    import IconInfo from '~icons/fluent/info-24-regular';
    import IconCheck from '~icons/fluent/checkmark-circle-24-regular';
    import IconWarning from '~icons/fluent/warning-24-regular';
    import IconPending from '~icons/fluent/clock-24-regular';
    import ConstitutionInfoModal from './ConstitutionInfoModal.svelte';

    // --- Component State ---
    let showInfoModal = $state(false);
    let modalIsLoading = $state(false);
    let modalError: string | null = $state(null);
    let modalTitle: string = $state("");
    let modalDescription: string | undefined = $state(undefined);
    let modalContent: string | undefined = $state(undefined);

    // --- Derived State ---
    let submissionEntries = $derived(Object.entries(constitutionStore.submissionStatuses).map(([key, status]) => {
        // Find the corresponding constitution metadata
        const constitution = constitutionStore.localConstitutions.find(c => c.localStorageKey === key);
        if (!constitution) return null;
        
        return {
            key,
            constitution,
            status
        };
    }).filter(Boolean)); // Remove null entries
    
    async function viewConstitutionDetails(constitution: LocalConstitutionMetadata) {
        modalTitle = constitution.title;
        modalDescription = "Submitted Constitution";
        modalContent = constitution.text;
        modalError = null;
        modalIsLoading = false;
        showInfoModal = true;
    }
    
    // Helper to format timestamp
    function formatDate(timestamp: string): string {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch (e) {
            return timestamp;
        }
    }
    
    function getStatusIcon(status: string) {
        switch (status) {
            case 'approved': return IconCheck;
            case 'rejected': return IconWarning;
            case 'pending': 
            default: return IconPending;
        }
    }
</script>

<div class="submissions-page">
    <h2>My Constitution Submissions</h2>
    
    {#if submissionEntries.length === 0}
        <div class="empty-state">
            <p>You haven't submitted any constitutions for review yet.</p>
            <p>When you submit a constitution, you'll be able to track its status here.</p>
        </div>
    {:else}
        <div class="submissions-list">
            {#each submissionEntries as entry}
                <div class="submission-card" class:approved={entry.status.status === 'approved'} class:rejected={entry.status.status === 'rejected'}>
                    <div class="submission-header">
                        <div class="status-indicator {entry.status.status}">
                            <svelte:component this={getStatusIcon(entry.status.status)} />
                            <span>{entry.status.status.charAt(0).toUpperCase() + entry.status.status.slice(1)}</span>
                        </div>
                        <span class="submission-date">Submitted: {formatDate(entry.status.timestamp)}</span>
                    </div>
                    <h3 class="constitution-title">{entry.constitution.title}</h3>
                    {#if entry.status.message}
                        <div class="status-message">
                            <p>{entry.status.message}</p>
                        </div>
                    {/if}
                    <div class="card-actions">
                        <button 
                            class="view-details-btn"
                            onclick={() => viewConstitutionDetails(entry.constitution)}
                        >
                            <IconInfo /> View Details
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Modal for viewing constitution details -->
{#if showInfoModal}
    <ConstitutionInfoModal
        title={modalTitle}
        description={modalDescription}
        content={modalContent}
        isLoading={modalIsLoading}
        error={modalError}
        onClose={() => (showInfoModal = false)}
    />
{/if}

<style lang="scss">
    @use '../styles/mixins' as *;

    .submissions-page {
        padding: var(--space-md);
        max-width: 800px;
        margin: 0 auto;
    }

    h2 {
        margin-bottom: var(--space-lg);
        color: var(--text-primary);
        font-size: 1.5rem;
    }

    .empty-state {
        text-align: center;
        padding: var(--space-xl);
        color: var(--text-secondary);
        border: 1px dashed var(--input-border);
        border-radius: var(--radius-md);
        background-color: var(--bg-surface);
        
        p {
            margin-bottom: var(--space-md);
            
            &:last-child {
                margin-bottom: 0;
            }
        }
    }

    .submissions-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
    }

    .submission-card {
        @include base-card();
        padding: var(--space-md);
        transition: all 0.2s ease;
        border-left: 4px solid var(--warning);
        
        &:hover {
            box-shadow: var(--shadow-md);
        }
        
        &.approved {
            border-left-color: var(--success);
        }
        
        &.rejected {
            border-left-color: var(--error);
        }
    }

    .submission-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-sm);
    }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-weight: 600;
        font-size: 0.9em;
        
        &.pending {
            color: var(--warning);
        }
        
        &.approved {
            color: var(--success);
        }
        
        &.rejected {
            color: var(--error);
        }
    }

    .submission-date {
        font-size: 0.8em;
        color: var(--text-secondary);
    }

    .constitution-title {
        font-size: 1.1em;
        margin-bottom: var(--space-sm);
        color: var(--text-primary);
    }

    .status-message {
        padding: var(--space-sm);
        background-color: var(--bg-surface);
        border-radius: var(--radius-sm);
        font-size: 0.9em;
        margin-bottom: var(--space-sm);
        border-left: 2px solid var(--input-border);
    }

    .card-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: var(--space-sm);
    }

    .view-details-btn {
        @include icon-button($padding: var(--space-xs) var(--space-sm));
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        color: var(--primary);
        font-size: 0.85em;
    }
</style>