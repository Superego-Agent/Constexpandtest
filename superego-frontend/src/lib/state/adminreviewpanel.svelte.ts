<script lang="ts">
    import { onMount } from 'svelte';
    import ConstitutionInfoModal from './ConstitutionInfoModal.svelte';
    import IconCheck from '~icons/fluent/checkmark-24-regular';
    import IconReject from '~icons/fluent/dismiss-24-regular';
    
    // --- Component State ---
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let pendingSubmissions = $state<PendingSubmission[]>([]);
    let showModal = $state(false);
    let activeSubmission = $state<PendingSubmission | null>(null);
    let reviewComment = $state('');
    
    interface PendingSubmission {
        id: string;
        title: string;
        description?: string;
        author: string;
        submittedAt: string;
        content: string;
        suggestedTags?: string[];
    }
    
    function formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }
    
    function viewSubmission(submission: PendingSubmission) {
        activeSubmission = submission;
        showModal = true;
    }
    
    async function approveSubmission(id: string) {
        if (!confirm('Are you sure you want to approve this submission?')) return;
        
        try {
            // In a real implementation, this would call the backend API
            console.log('Approving submission:', id, 'with comment:', reviewComment);
            
            // Remove from the pending list
            pendingSubmissions = pendingSubmissions.filter(s => s.id !== id);
            
            // Close the modal if this was the active submission
            if (activeSubmission?.id === id) {
                showModal = false;
                activeSubmission = null;
            }
            
            // Reset the review comment
            reviewComment = '';
            
            alert('Submission approved successfully.');
        } catch (err) {
            console.error('Error approving submission:', err);
            alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    
    async function rejectSubmission(id: string) {
        if (!confirm('Are you sure you want to reject this submission?')) return;
        
        try {
            // In a real implementation, this would call the backend API
            console.log('Rejecting submission:', id, 'with comment:', reviewComment);
            
            // Remove from the pending list
            pendingSubmissions = pendingSubmissions.filter(s => s.id !== id);
            
            // Close the modal if this was the active submission
            if (activeSubmission?.id === id) {
                showModal = false;
                activeSubmission = null;
            }
            
            // Reset the review comment
            reviewComment = '';
            
            alert('Submission rejected successfully.');
        } catch (err) {
            console.error('Error rejecting submission:', err);
            alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    
    onMount(async () => {
        try {
            // In a real implementation, this would fetch from the backend
            // For now, let's create some test data
            const mockData: PendingSubmission[] = [
                {
                    id: 'submission-1',
                    title: 'Medical Ethics Guidelines for AI',
                    description: 'A set of guidelines for AI systems that handle medical information or provide healthcare advice.',
                    author: 'dr.smith@example.com',
                    submittedAt: '2025-04-22T09:15:30Z',
                    content: '# Medical Ethics Guidelines for AI\n\n## Preamble\n\nThese guidelines establish ethical principles for AI systems in healthcare...',
                    suggestedTags: ['healthcare', 'ethics', 'medical']
                },
                {
                    id: 'submission-2',
                    title: 'Educational Content Moderation Framework',
                    description: 'Guidelines for AI systems that moderate or generate educational content for students.',
                    author: 'educator@example.com',
                    submittedAt: '2025-04-21T14:22:10Z',
                    content: '# Educational Content Moderation Framework\n\n## Overview\n\nThis constitution provides guidelines for AI systems that assist in educational contexts...',
                    suggestedTags: ['education', 'moderation', 'content']
                },
                {
                    id: 'submission-3',
                    title: 'Financial Advice Ethical Framework',
                    description: 'Ethical guidelines for AI systems providing financial advice or analysis.',
                    author: 'finance.ethics@example.com',
                    submittedAt: '2025-04-20T11:05:45Z',
                    content: '# Financial Advice Ethical Framework\n\n## Purpose\n\nTo ensure AI systems providing financial guidance operate with integrity...',
                    suggestedTags: ['finance', 'ethics', 'advice']
                }
            ];
            
            // Simulate an API call
            await new Promise(resolve => setTimeout(resolve, 800));
            pendingSubmissions = mockData;
        } catch (err) {
            console.error('Error loading pending submissions:', err);
            error = `Failed to load submissions: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="admin-review-panel">
    <div class="header">
        <h1>Submission Review Panel</h1>
        <p class="subtitle">Review and approve constitution submissions for the marketplace</p>
    </div>
    
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading submissions...</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p>Error: {error}</p>
            <button class="retry-button" onclick={() => window.location.reload()}>Retry</button>
        </div>
    {:else if pendingSubmissions.length === 0}
        <div class="empty-state">
            <p>No pending submissions to review.</p>
        </div>
    {:else}
        <div class="submissions-list">
            <h2 class="section-title">Pending Review ({pendingSubmissions.length})</h2>
            
            <div class="submission-cards">
                {#each pendingSubmissions as submission (submission.id)}
                    <div class="submission-card">
                        <div class="submission-header">
                            <h3 class="submission-title">{submission.title}</h3>
                            <span class="submission-date">Submitted: {formatDate(submission.submittedAt)}</span>
                        </div>
                        
                        {#if submission.description}
                            <p class="submission-description">{submission.description}</p>
                        {/if}
                        
                        <div class="submission-author">
                            Submitted by: {submission.author}
                        </div>
                        
                        {#if submission.suggestedTags && submission.suggestedTags.length > 0}
                            <div class="submission-tags">
                                <span class="tags-label">Suggested tags:</span>
                                <div class="tags-container">
                                    {#each submission.suggestedTags as tag}
                                        <span class="tag">{tag}</span>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                        
                        <div class="submission-actions">
                            <button class="view-button" onclick={() => viewSubmission(submission)}>
                                View Content
                            </button>
                            <button class="approve-button" onclick={() => approveSubmission(submission.id)}>
                                <IconCheck /> Approve
                            </button>
                            <button class="reject-button" onclick={() => rejectSubmission(submission.id)}>
                                <IconReject /> Reject
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

{#if showModal && activeSubmission}
    <div class="review-modal-overlay">
        <div class="review-modal-content">
            <button class="close-button" onclick={() => (showModal = false)}>×</button>
            
            <h2>Review Submission</h2>
            
            <div class="review-content">
                <h3>{activeSubmission.title}</h3>
                <p class="submission-meta">
                    Submitted by {activeSubmission.author} on {formatDate(activeSubmission.submittedAt)}
                </p>
                
                <div class="content-preview">
                    <ConstitutionInfoModal
                        title={activeSubmission.title}
                        description={activeSubmission.description}
                        content={activeSubmission.content}
                        isInline={true}
                    />
                </div>
                
                <div class="review-form">
                    <div class="form-group">
                        <label for="review-comment">Review Comment (Optional)</label>
                        <textarea 
                            id="review-comment" 
                            bind:value={reviewComment} 
                            placeholder="Add a comment about this submission..."
                            rows="3"
                        ></textarea>
                    </div>
                    
                    <div class="review-actions">
                        <button class="cancel-button" onclick={() => (showModal = false)}>
                            Cancel
                        </button>
                        <button class="approve-button" onclick={() => approveSubmission(activeSubmission.id)}>
                            <IconCheck /> Approve
                        </button>
                        <button class="reject-button" onclick={() => rejectSubmission(activeSubmission.id)}>
                            <IconReject /> Reject
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<style lang="scss">
    @use '../styles/mixins' as *;

    .admin-review-panel {
        padding: var(--space-md);
        max-width: 1200px;
        margin: 0 auto;
    }

    .header {
        margin-bottom: var(--space-lg);
        
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

    .section-title {
        font-size: 1.2rem;
        color: var(--text-primary);
        margin-bottom: var(--space-md);
        padding-bottom: var(--space-xs);
        border-bottom: 1px solid var(--input-border);
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

    .retry-button {
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

    .submission-cards {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-md);
        
        @media (min-width: 768px) {
            grid-template-columns: repeat(2, 1fr);
        }
        
        @media (min-width: 1200px) {
            grid-template-columns: repeat(3, 1fr);
        }
    }

    .submission-card {
        @include base-card();
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .submission-header {
        margin-bottom: var(--space-sm);
    }

    .submission-title {
        font-size: 1.1rem;
        color: var(--text-primary);
        margin-bottom: var(--space-xs);
    }

    .submission-date {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }

    .submission-description {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin-bottom: var(--space-md);
        flex-grow: 1;
    }

    .submission-author {
        font-size: 0.9rem;
        margin-bottom: var(--space-sm);
    }

    .submission-tags {
        margin-bottom: var(--space-md);
        
        .tags-label {
            font-size: 0.85rem;
            color: var(--text-secondary);
            display: block;
            margin-bottom: 4px;
        }
        
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        
        .tag {
            font-size: 0.75rem;
            background-color: var(--bg-hover);
            color: var(--text-secondary);
            padding: 2px 6px;
            border-radius: var(--radius-pill);
        }
    }

    .submission-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: auto;
        padding-top: var(--space-sm);
    }

    .view-button, .approve-button, .reject-button, .cancel-button {
        padding: 6px 12px;
        border-radius: var(--radius-md);
        font-size: 0.85rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
    }

    .view-button {
        background-color: var(--bg-hover);
        color: var(--text-primary);
        
        &:hover {
            background-color: var(--bg-elevated);
        }
    }

    .approve-button {
        background-color: var(--success);
        color: white;
        
        &:hover {
            background-color: color-mix(in srgb, var(--success) 85%, white);
        }
    }

    .reject-button {
        background-color: var(--error);
        color: white;
        
        &:hover {
            background-color: color-mix(in srgb, var(--error) 85%, white);
        }
    }

    .cancel-button {
        background-color: var(--bg-hover);
        color: var(--text-primary);
        
        &:hover {
            background-color: var(--bg-elevated);
        }
    }

    .review-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .review-modal-content {
        background-color: var(--bg-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        padding: var(--space-lg);
        position: relative;
        
        h2 {
            margin-bottom: var(--space-md);
            color: var(--text-primary);
        }
    }

    .close-button {
        position: absolute;
        top: var(--space-md);
        right: var(--space-md);
        font-size: 1.5rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-secondary);
        
        &:hover {
            color: var(--text-primary);
        }
    }

    .review-content {
        h3 {
            font-size: 1.2rem;
            color: var(--text-primary);
            margin-bottom: var(--space-xs);
        }
        
        .submission-meta {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: var(--space-md);
        }
    }

    .content-preview {
        margin-bottom: var(--space-md);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        padding: var(--space-md);
        background-color: var(--bg-elevated);
        max-height: 400px;
        overflow-y: auto;
    }

    .review-form {
        .form-group {
            margin-bottom: var(--space-md);
            
            label {
                display: block;
                margin-bottom: var(--space-xs);
                font-size: 0.9rem;
                color: var(--text-secondary);
            }
            
            textarea {
                width: 100%;
                padding: var(--space-sm);
                border: 1px solid var(--input-border);
                border-radius: var(--radius-md);
                font-size: 0.9rem;
                resize: vertical;
                
                &:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--primary-lightest);
                }
            }
        }
        
        .review-actions {
            display: flex;
            justify-content: flex-end;
            gap: var(--space-sm);
        }
    }
</style>