<script lang="ts">
    import { onMount } from 'svelte';
    import { 
        fetchPendingReviews, 
        fetchSubmissionDetails, 
        runSuperEgoCheck,
        approveSubmission, 
        rejectSubmission,
        requestSubmissionChanges,
        markSubmissionUnderReview
    } from '$lib/api/rest.svelte';
    import ConstitutionInfoModal from '../components/ConstitutionInfoModal.svelte';
    import IconCheck from '~icons/fluent/checkmark-24-regular';
    import IconReject from '~icons/fluent/dismiss-24-regular';
    import IconInfo from '~icons/fluent/info-24-regular';
    import IconWarning from '~icons/fluent/warning-24-regular';
    import IconRefresh from '~icons/fluent/arrow-sync-24-regular';
    import IconFilter from '~icons/fluent/filter-24-regular';
    import IconTag from '~icons/fluent/tag-24-regular';
    import IconSearch from '~icons/fluent/search-24-regular';
    
    // --- Component State ---
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let pendingSubmissions = $state<PendingSubmission[]>([]);
    let filteredSubmissions = $state<PendingSubmission[]>([]);
    let showModal = $state(false);
    let activeSubmission = $state<PendingSubmission | null>(null);
    let reviewComment = $state('');
    let rejectionReason = $state<'inappropriate' | 'low_quality' | 'duplicate' | 'other'>('other');
    let runningCheck = $state(false);
    let filterType = $state<'all' | 'flagged' | 'clean'>('all');
    let addedTags = $state<string[]>([]);
    let isWhitelisted = $state(true);
    let showSuperEgoResults = $state(false);
    let superEgoResults = $state<SuperEgoCheckResult | null>(null);
    let activeTab = $state<'content' | 'superego' | 'decision'>('content');
    let currentReviewStatus = $state<'pending' | 'requires_changes' | 'rejected' | 'approved'>('pending');
    let requestChangesReason = $state<'format' | 'clarity' | 'safety' | 'incomplete' | 'other'>('format');
    
    // Enhanced submission type with more detailed status
    interface PendingSubmission {
        id: string;
        title: string;
        description?: string;
        author: string;
        submittedAt: string;
        content: string;
        suggestedTags?: string[];
        initialCheckResult?: SuperEgoCheckResult;
        status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'requires_changes';
        reviewerId?: string;
        reviewerComments?: string;
    }
    
    // Enhanced SuperEgo result structure
    interface SuperEgoCheckResult {
        score: number;
        issues: string[];
        warnings: string[];
        recommendations: string[];
        passedChecks: string[];
        dimensions: {
            safety: number;
            clarity: number;
            completeness: number;
            compliance: number;
        };
        flagged: boolean;
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
    
    async function loadSubmissions() {
        isLoading = true;
        error = null;
        
        try {
            // In a real implementation, this would fetch from the backend API
            const submissions = await fetchPendingReviews();
            pendingSubmissions = submissions;
            applyFilter();
        } catch (err) {
            console.error('Error loading pending submissions:', err);
            error = `Failed to load submissions: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            isLoading = false;
        }
    }
    
    function applyFilter() {
        if (filterType === 'all') {
            filteredSubmissions = [...pendingSubmissions];
        } else if (filterType === 'flagged') {
            filteredSubmissions = pendingSubmissions.filter(sub => 
                sub.initialCheckResult && 
                (sub.initialCheckResult.issues.length > 0 || 
                 sub.initialCheckResult.score < 70)
            );
        } else if (filterType === 'clean') {
            filteredSubmissions = pendingSubmissions.filter(sub => 
                sub.initialCheckResult && 
                sub.initialCheckResult.issues.length === 0 && 
                sub.initialCheckResult.score >= 70
            );
        }
    }
    
    // Start review process - mark as under review
    async function startReview(submission: PendingSubmission) {
        try {
            await markSubmissionUnderReview(submission.id);
            
            // Update status locally
            pendingSubmissions = pendingSubmissions.map(s => 
                s.id === submission.id 
                    ? {...s, status: 'under_review'} 
                    : s
            );
            
            // Now view the submission details
            viewSubmission(submission);
        } catch (err) {
            console.error('Error starting review:', err);
            error = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    async function viewSubmission(submission: PendingSubmission) {
        try {
            // In a production app, fetch full details from the API
            const details = await fetchSubmissionDetails(submission.id);
            
            // Merge the details with the submission data
            activeSubmission = {
                ...submission,
                ...details
            };
            
            // Reset review state
            reviewComment = activeSubmission.reviewerComments || '';
            addedTags = activeSubmission.suggestedTags || [];
            isWhitelisted = true;
            
            // Set appropriate review status based on submission status
            currentReviewStatus = (activeSubmission.status === 'requires_changes' ? 'requires_changes' : 
                                  activeSubmission.status === 'rejected' ? 'rejected' :
                                  activeSubmission.status === 'approved' ? 'approved' : 'pending') as any;
            
            // Reset active tab
            activeTab = 'content';
            
            // Show the modal
            showModal = true;
            
            // If there's no initial check result, run a check automatically
            if (!activeSubmission.initialCheckResult) {
                runSuperEgoCheck();
            } else {
                superEgoResults = activeSubmission.initialCheckResult;
            }
        } catch (err) {
            console.error('Error loading submission details:', err);
            error = `Failed to load details: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    async function runSuperEgoCheck() {
        if (!activeSubmission) return;
        
        runningCheck = true;
        showSuperEgoResults = true;
        
        try {
            // Call the backend API to run the superego check
            superEgoResults = await runSuperEgoCheck(activeSubmission.id);
            
            // Update the submission with the results
            if (activeSubmission) {
                activeSubmission.initialCheckResult = superEgoResults;
            }
        } catch (err) {
            console.error('Error running superego check:', err);
            error = `Check failed: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            runningCheck = false;
        }
    }
    
    async function handleApprove() {
        if (!activeSubmission) return;
        
        if (!confirm(`Are you sure you want to approve "${activeSubmission.title}"?`)) {
            return;
        }
        
        try {
            await approveSubmission(activeSubmission.id, {
                comment: reviewComment,
                tags: addedTags,
                isWhitelisted: isWhitelisted
            });
            
            // Remove from the pending list
            pendingSubmissions = pendingSubmissions.filter(s => s.id !== activeSubmission.id);
            applyFilter();
            
            // Close the modal
            showModal = false;
            activeSubmission = null;
            
            // Reset the review comment
            reviewComment = '';
            
            alert('Submission approved successfully.');
        } catch (err) {
            console.error('Error approving submission:', err);
            error = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    async function handleReject() {
        if (!activeSubmission) return;
        
        if (!reviewComment.trim()) {
            alert('Please provide a reason for rejection in the comment field.');
            return;
        }
        
        if (!confirm(`Are you sure you want to reject "${activeSubmission.title}"?`)) {
            return;
        }
        
        try {
            await rejectSubmission(activeSubmission.id, {
                comment: reviewComment,
                reason: rejectionReason
            });
            
            // Remove from the pending list
            pendingSubmissions = pendingSubmissions.filter(s => s.id !== activeSubmission.id);
            applyFilter();
            
            // Close the modal
            showModal = false;
            activeSubmission = null;
            
            // Reset the review comment
            reviewComment = '';
            
            alert('Submission rejected successfully.');
        } catch (err) {
            console.error('Error rejecting submission:', err);
            error = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    // Add ability to request changes instead of rejecting
    async function handleRequestChanges() {
        if (!activeSubmission) return;
        
        if (!reviewComment.trim()) {
            alert('Please provide specific changes needed in the comment field.');
            return;
        }
        
        if (!confirm(`Are you sure you want to request changes for "${activeSubmission.title}"?`)) {
            return;
        }
        
        try {
            await requestSubmissionChanges(activeSubmission.id, {
                comment: reviewComment,
                reason: requestChangesReason
            });
            
            // Update status in the pending list
            pendingSubmissions = pendingSubmissions.map(s => 
                s.id === activeSubmission.id 
                    ? {...s, status: 'requires_changes'} 
                    : s
            );
            applyFilter();
            
            // Close the modal
            showModal = false;
            activeSubmission = null;
            
            // Reset the review comment
            reviewComment = '';
            
            alert('Change request sent successfully.');
        } catch (err) {
            console.error('Error requesting changes:', err);
            error = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    
    function toggleTag(tag: string) {
        if (addedTags.includes(tag)) {
            addedTags = addedTags.filter(t => t !== tag);
        } else {
            addedTags = [...addedTags, tag];
        }
    }
    
    function addNewTag(event: KeyboardEvent) {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            const newTag = event.target.value.trim();
            if (newTag && !addedTags.includes(newTag)) {
                addedTags = [...addedTags, newTag];
                event.target.value = '';
            }
            event.preventDefault();
        }
    }
    
    onMount(() => {
        loadSubmissions();
    });
</script>

<div class="admin-review-panel">
    <div class="header">
        <h1>Constitution Review Panel</h1>
        <p class="subtitle">Review and approve constitution submissions for the marketplace</p>
    </div>
    
    <div class="control-bar">
        <div class="filter-section">
            <button class="filter-button" class:active={filterType === 'all'} onclick={() => { filterType = 'all'; applyFilter(); }}>
                All <span class="count">({pendingSubmissions.length})</span>
            </button>
            <button class="filter-button" class:active={filterType === 'flagged'} onclick={() => { filterType = 'flagged'; applyFilter(); }}>
                <IconWarning /> Flagged
            </button>
            <button class="filter-button" class:active={filterType === 'clean'} onclick={() => { filterType = 'clean'; applyFilter(); }}>
                <IconCheck /> Clean
            </button>
        </div>
        
        <button class="refresh-button" onclick={loadSubmissions} disabled={isLoading}>
            <IconRefresh class:spinning={isLoading} /> Refresh
        </button>
    </div>
    
    {#if error}
        <div class="error-state">
            <p>Error: {error}</p>
            <button class="retry-button" onclick={loadSubmissions}>Retry</button>
        </div>
    {/if}
    
    {#if isLoading && pendingSubmissions.length === 0}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading submissions...</p>
        </div>
    {:else if filteredSubmissions.length === 0}
        <div class="empty-state">
            <p>No {filterType === 'all' ? '' : filterType} submissions to review.</p>
        </div>
    {:else}
        <div class="submissions-list">
            <h2 class="section-title">Pending Review ({filteredSubmissions.length})</h2>
            
            <div class="submission-cards">
                {#each filteredSubmissions as submission (submission.id)}
                    <div class="submission-card" class:flagged={submission.initialCheckResult && (submission.initialCheckResult.issues.length > 0 || submission.initialCheckResult.score < 70)} class:under-review={submission.status === 'under_review'}>
                        <div class="submission-header">
                            <h3 class="submission-title">{submission.title}</h3>
                            
                            {#if submission.initialCheckResult}
                                <div class="score-badge" class:warning={submission.initialCheckResult.score < 70} class:success={submission.initialCheckResult.score >= 70}>
                                    Score: {submission.initialCheckResult.score}/100
                                </div>
                            {/if}
                        </div>
                        
                        <div class="submission-meta">
                            <div class="submission-author">
                                From: {submission.author}
                            </div>
                            <span class="submission-date">Submitted: {formatDate(submission.submittedAt)}</span>
                        </div>
                        
                        <div class="submission-status">
                            <span class="status-indicator {submission.status}">
                                {submission.status === 'pending' ? '🕒 Pending' : 
                                 submission.status === 'under_review' ? '🔍 Under Review' :
                                 submission.status === 'requires_changes' ? '⚠️ Changes Requested' :
                                 submission.status === 'approved' ? '✅ Approved' :
                                 submission.status === 'rejected' ? '❌ Rejected' : submission.status}
                            </span>
                        </div>
                        
                        {#if submission.description}
                            <p class="submission-description">{submission.description}</p>
                        {/if}
                        
                        {#if submission.initialCheckResult && submission.initialCheckResult.issues.length > 0}
                            <div class="issues-preview">
                                <div class="issues-badge">
                                    <IconWarning /> {submission.initialCheckResult.issues.length} Issue{submission.initialCheckResult.issues.length > 1 ? 's' : ''}
                                </div>
                                <div class="issues-list">
                                    {#each submission.initialCheckResult.issues.slice(0, 2) as issue}
                                        <div class="issue-item">{issue}</div>
                                    {/each}
                                    {#if submission.initialCheckResult.issues.length > 2}
                                        <div class="issue-more">+{submission.initialCheckResult.issues.length - 2} more</div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                        
                        <div class="card-actions">
                            {#if submission.status === 'pending'}
                                <button class="start-review-button" onclick={() => startReview(submission)}>
                                    <IconSearch /> Start Review
                                </button>
                            {:else}
                                <button class="continue-button" onclick={() => viewSubmission(submission)}>
                                    <IconInfo /> View Details
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<!-- Enhanced modal UI with tabbed interface for review -->
{#if showModal && activeSubmission}
    <div class="review-modal-overlay">
        <div class="review-modal">
            <div class="modal-header">
                <h2>{activeSubmission.title}</h2>
                <button class="close-button" onclick={() => showModal = false}>×</button>
            </div>
            
            <div class="review-tabs">
                <button 
                    class="tab" 
                    class:active={activeTab === 'content'} 
                    onclick={() => activeTab = 'content'}
                >
                    Content
                </button>
                <button 
                    class="tab" 
                    class:active={activeTab === 'superego'} 
                    onclick={() => activeTab = 'superego'}
                >
                    SuperEgo Check
                </button>
                <button 
                    class="tab" 
                    class:active={activeTab === 'decision'} 
                    onclick={() => activeTab = 'decision'}
                >
                    Review Decision
                </button>
            </div>
            
            {#if activeTab === 'content'}
                <div class="content-view">
                    <pre class="constitution-content">{activeSubmission.content}</pre>
                </div>
            {:else if activeTab === 'superego'}
                <div class="superego-results">
                    {#if !superEgoResults}
                        <div class="loading">
                            <div class="spinner"></div>
                            <p>Running SuperEgo check...</p>
                        </div>
                    {:else}
                        <div class="score-overview">
                            <div class="main-score {superEgoResults.score < 70 ? 'low' : superEgoResults.score > 90 ? 'high' : 'medium'}">
                                <span class="score-value">{superEgoResults.score}</span>
                                <span class="score-max">/100</span>
                            </div>
                            <div class="dimension-scores">
                                {#each Object.entries(superEgoResults.dimensions) as [dimension, score]}
                                    <div class="dimension">
                                        <span class="dimension-name">{dimension}</span>
                                        <div class="dimension-bar">
                                            <div class="dimension-fill" style="width: {score}%" class:low={score < 70} class:medium={score >= 70 && score < 90} class:high={score >= 90}></div>
                                        </div>
                                        <span class="dimension-value">{score}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        
                        {#if superEgoResults.issues.length > 0}
                            <div class="section issues">
                                <h3>Issues</h3>
                                <ul>
                                    {#each superEgoResults.issues as issue}
                                        <li>{issue}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        {#if superEgoResults.warnings.length > 0}
                            <div class="section warnings">
                                <h3>Warnings</h3>
                                <ul>
                                    {#each superEgoResults.warnings as warning}
                                        <li>{warning}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        <div class="section recommendations">
                            <h3>Recommendations</h3>
                            <ul>
                                {#each superEgoResults.recommendations as recommendation}
                                    <li>{recommendation}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </div>
            {:else if activeTab === 'decision'}
                <div class="review-decision">
                    <div class="status-select">
                        <label class="status-label">Review Status</label>
                        <div class="status-options">
                            <label class="status-option">
                                <input 
                                    type="radio" 
                                    name="review-status" 
                                    value="approved" 
                                    bind:group={currentReviewStatus}
                                />
                                <span class="status-text">Approve</span>
                            </label>
                            <label class="status-option">
                                <input 
                                    type="radio" 
                                    name="review-status" 
                                    value="requires_changes" 
                                    bind:group={currentReviewStatus}
                                />
                                <span class="status-text">Request Changes</span>
                            </label>
                            <label class="status-option">
                                <input 
                                    type="radio" 
                                    name="review-status" 
                                    value="rejected" 
                                    bind:group={currentReviewStatus}
                                />
                                <span class="status-text">Reject</span>
                            </label>
                        </div>
                    </div>
                    
                    {#if currentReviewStatus === 'requires_changes'}
                        <div class="changes-reason">
                            <label for="changes-reason">Reason for Changes</label>
                            <select id="changes-reason" bind:value={requestChangesReason}>
                                <option value="format">Formatting Issues</option>
                                <option value="clarity">Clarity Concerns</option>
                                <option value="safety">Safety Concerns</option>
                                <option value="incomplete">Incomplete Content</option>
                                <option value="other">Other Reason</option>
                            </select>
                        </div>
                    {:else if currentReviewStatus === 'rejected'}
                        <div class="rejection-reason">
                            <label for="rejection-reason">Rejection Reason</label>
                            <select id="rejection-reason" bind:value={rejectionReason}>
                                <option value="inappropriate">Inappropriate Content</option>
                                <option value="low_quality">Low Quality</option>
                                <option value="duplicate">Duplicate Submission</option>
                                <option value="other">Other Reason</option>
                            </select>
                        </div>
                    {:else if currentReviewStatus === 'approved'}
                        <div class="approval-options">
                            <label class="whitelist-option">
                                <input type="checkbox" bind:checked={isWhitelisted} />
                                <span>Whitelist for MCP servers</span>
                            </label>
                            
                            <div class="tags-section">
                                <h4>Assign Tags</h4>
                                <div class="selected-tags">
                                    {#each addedTags as tag}
                                        <span class="tag">
                                            {tag}
                                            <button 
                                                class="remove-tag" 
                                                onclick={() => toggleTag(tag)}
                                            >×</button>
                                        </span>
                                    {/each}
                                </div>
                                <input 
                                    type="text"
                                    placeholder="Add a tag and press Enter"
                                    onkeydown={addNewTag}
                                    class="tag-input"
                                />
                            </div>
                        </div>
                    {/if}
                    
                    <div class="review-comment">
                        <label for="review-comment">Review Comment (will be sent to submitter)</label>
                        <textarea
                            id="review-comment"
                            rows="5"
                            bind:value={reviewComment}
                            placeholder="Provide feedback to the submitter..."
                        ></textarea>
                    </div>
                    
                    <div class="decision-actions">
                        {#if currentReviewStatus === 'approved'}
                            <button class="action-button approve" onclick={handleApprove}>
                                <IconCheck /> Approve Constitution
                            </button>
                        {:else if currentReviewStatus === 'requires_changes'}
                            <button class="action-button request-changes" onclick={handleRequestChanges}>
                                <IconRefresh /> Request Changes
                            </button>
                        {:else if currentReviewStatus === 'rejected'}
                            <button class="action-button reject" onclick={handleReject}>
                                <IconReject /> Reject Constitution
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}
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

    .control-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-md);
    }

    .filter-section {
        display: flex;
        gap: var(--space-sm);
    }

    .filter-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        background-color: var(--bg-surface);
        cursor: pointer;
        
        &.active {
            background-color: var(--primary);
            color: white;
            border-color: var(--primary);
        }
        
        .count {
            font-size: 0.8em;
            opacity: 0.8;
        }
    }

    .refresh-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        background-color: var(--bg-surface);
        cursor: pointer;
        
        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .spinning {
            animation: spin 1s linear infinite;
        }
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .error-state, .loading-state, .empty-state {
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

    .retry-button {
        margin-top: var(--space-sm);
        padding: 8px 16px;
        background-color: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
    }

    .section-title {
        margin-bottom: var(--space-md);
        font-size: 1.2rem;
        color: var(--text-primary);
    }

    .submission-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--space-md);
    }

    .submission-card {
        @include base-card();
        padding: var(--space-md);
        transition: all 0.2s ease;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }
        
        &.flagged {
            border-left: 3px solid var(--error);
        }
        
        &.under-review {
            border-left: 3px solid var(--primary);
        }
    }

    .submission-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-sm);
    }

    .submission-title {
        font-size: 1.1rem;
        margin: 0;
        color: var(--text-primary);
    }

    .score-badge {
        padding: 4px 8px;
        border-radius: var(--radius-pill);
        font-size: 0.8rem;
        
        &.warning {
            background-color: var(--warning-bg);
            color: var(--warning);
        }
        
        &.success {
            background-color: var(--success-bg);
            color: var(--success);
        }
    }

    .submission-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-bottom: var(--space-sm);
    }
    
    .submission-status {
        margin-bottom: var(--space-sm);
        
        .status-indicator {
            display: inline-block;
            font-size: 0.85rem;
            font-weight: 500;
            
            &.pending {
                color: var(--text-secondary);
            }
            
            &.under_review {
                color: var(--primary);
            }
            
            &.requires_changes {
                color: var(--warning);
            }
            
            &.approved {
                color: var(--success);
            }
            
            &.rejected {
                color: var(--error);
            }
        }
    }

    .submission-description {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin-bottom: var(--space-md);
    }

    .issues-preview {
        background-color: var(--error-bg);
        border-radius: var(--radius-sm);
        padding: var(--space-sm);
        margin-bottom: var(--space-md);
        
        .issues-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--error);
            font-weight: 600;
            font-size: 0.9rem;
            margin-bottom: 6px;
        }
        
        .issues-list {
            font-size: 0.85rem;
            
            .issue-item {
                margin-bottom: 4px;
                padding-left: 8px;
                border-left: 2px solid var(--error);
            }
            
            .issue-more {
                font-style: italic;
                color: var(--text-secondary);
                font-size: 0.8rem;
            }
        }
    }

    .card-actions {
        display: flex;
        justify-content: center;
        margin-top: var(--space-sm);
    }

    .start-review-button, .continue-button {
        display: flex;
        align-items: center;
        gap: 6px;
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
    
    /* Modal styles */
    .review-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: var(--space-md);
    }
    
    .review-modal {
        background-color: var(--bg-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        
        .modal-header {
            padding: var(--space-md);
            border-bottom: 1px solid var(--input-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            
            h2 {
                margin: 0;
                font-size: 1.4rem;
            }
            
            .close-button {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: var(--text-secondary);
                
                &:hover {
                    color: var(--text-primary);
                }
            }
        }
    }
    
    .review-tabs {
        display: flex;
        border-bottom: 1px solid var(--input-border);
        
        .tab {
            padding: 12px 24px;
            background: none;
            border: none;
            border-bottom: 3px solid transparent;
            cursor: pointer;
            flex: 1;
            text-align: center;
            
            &.active {
                border-bottom-color: var(--primary);
                color: var(--primary);
                font-weight: 600;
            }
            
            &:hover:not(.active) {
                background-color: var(--bg-hover);
            }
        }
    }
    
    .content-view {
        padding: var(--space-md);
        
        .constitution-content {
            font-family: monospace;
            white-space: pre-wrap;
            background-color: var(--bg-elevated);
            padding: var(--space-md);
            border-radius: var(--radius-md);
            max-height: 400px;
            overflow-y: auto;
        }
    }
    
    .superego-results {
        padding: var(--space-md);
        
        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: var(--space-xl);
            
            .spinner {
                margin-bottom: var(--space-md);
            }
        }
        
        .score-overview {
            display: flex;
            gap: 24px;
            margin-bottom: 24px;
            
            .main-score {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background-color: var(--bg-elevated);
                
                &.low {
                    background-color: var(--error-bg);
                    color: var(--error);
                }
                
                &.medium {
                    background-color: var(--warning-bg);
                    color: var(--warning);
                }
                
                &.high {
                    background-color: var(--success-bg);
                    color: var(--success);
                }
                
                .score-value {
                    font-size: 2em;
                    font-weight: bold;
                }
                
                .score-max {
                    font-size: 0.9em;
                    opacity: 0.7;
                }
            }
            
            .dimension-scores {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
                
                .dimension {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    
                    .dimension-name {
                        width: 120px;
                        font-size: 0.9em;
                        text-transform: capitalize;
                    }
                    
                    .dimension-bar {
                        flex-grow: 1;
                        height: 8px;
                        background-color: var(--bg-surface);
                        border-radius: 4px;
                        overflow: hidden;
                        
                        .dimension-fill {
                            height: 100%;
                            background-color: var(--primary);
                            
                            &.low {
                                background-color: var(--error);
                            }
                            
                            &.medium {
                                background-color: var(--warning);
                            }
                            
                            &.high {
                                background-color: var(--success);
                            }
                        }
                    }
                    
                    .dimension-value {
                        width: 40px;
                        text-align: right;
                        font-size: 0.9em;
                    }
                }
            }
        }
        
        .section {
            margin-bottom: var(--space-md);
            
            h3 {
                font-size: 1.1rem;
                margin-bottom: var(--space-sm);
                color: var(--text-primary);
            }
            
            ul {
                margin-left: var(--space-lg);
                
                li {
                    margin-bottom: 6px;
                }
            }
            
            &.issues {
                color: var(--error);
            }
            
            &.warnings {
                color: var(--warning);
            }
        }
    }
    
    .review-decision {
        padding: var(--space-md);
        
        .status-select {
            margin-bottom: var(--space-md);
            
            .status-label {
                display: block;
                font-weight: 600;
                margin-bottom: var(--space-sm);
            }
            
            .status-options {
                display: flex;
                gap: var(--space-md);
                flex-wrap: wrap;
                
                .status-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border: 1px solid var(--input-border);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    
                    input[type="radio"] {
                        accent-color: var(--primary);
                    }
                }
            }
        }
        
        .changes-reason, .rejection-reason {
            margin-bottom: var(--space-md);
            
            label {
                display: block;
                margin-bottom: var(--space-xs);
            }
            
            select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--input-border);
                border-radius: var(--radius-md);
                background-color: var(--bg-surface);
            }
        }
        
        .approval-options {
            margin-bottom: var(--space-md);
            
            .whitelist-option {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: var(--space-md);
                
                input[type="checkbox"] {
                    accent-color: var(--primary);
                }
            }
            
            .tags-section {
                h4 {
                    margin-bottom: var(--space-sm);
                }
                
                .selected-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: var(--space-sm);
                    
                    .tag {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 8px;
                        background-color: var(--bg-elevated);
                        border-radius: var(--radius-pill);
                        font-size: 0.85em;
                        
                        .remove-tag {
                            background: none;
                            border: none;
                            cursor: pointer;
                            font-size: 1.2em;
                            line-height: 1;
                            color: var(--text-secondary);
                            
                            &:hover {
                                color: var(--error);
                            }
                        }
                    }
                }
                
                .tag-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--input-border);
                    border-radius: var(--radius-md);
                    background-color: var(--bg-surface);
                }
            }
        }
        
        .review-comment {
            margin-bottom: var(--space-md);
            
            label {
                display: block;
                margin-bottom: var(--space-xs);
            }
            
            textarea {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--input-border);
                border-radius: var(--radius-md);
                background-color: var(--bg-surface);
                resize: vertical;
                min-height: 120px;
            }
        }
        
        .decision-actions {
            display: flex;
            justify-content: center;
            
            .action-button {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 20px;
                border: none;
                border-radius: var(--radius-md);
                cursor: pointer;
                font-weight: 600;
                
                &.approve {
                    background-color: var(--success);
                    color: white;
                    
                    &:hover {
                        background-color: color-mix(in srgb, var(--success) 80%, black);
                    }
                }
                
                &.request-changes {
                    background-color: var(--warning);
                    color: white;
                    
                    &:hover {
                        background-color: color-mix(in srgb, var(--warning) 80%, black);
                    }
                }
                
                &.reject {
                    background-color: var(--error);
                    color: white;
                    
                    &:hover {
                        background-color: color-mix(in srgb, var(--error) 80%, black);
                    }
                }
            }
        }
    }
</style>