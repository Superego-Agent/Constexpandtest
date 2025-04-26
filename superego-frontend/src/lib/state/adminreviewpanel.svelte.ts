<script lang="ts">
    import { onMount } from 'svelte';
    import { 
        fetchPendingReviews, 
        fetchSubmissionDetails, 
        runSuperEgoCheck,
        approveSubmission, 
        rejectSubmission 
    } from '$lib/api/rest.svelte';
    import ConstitutionInfoModal from '../components/ConstitutionInfoModal.svelte';
    import IconCheck from '~icons/fluent/checkmark-24-regular';
    import IconReject from '~icons/fluent/dismiss-24-regular';
    import IconInfo from '~icons/fluent/info-24-regular';
    import IconWarning from '~icons/fluent/warning-24-regular';
    import IconRefresh from '~icons/fluent/arrow-sync-24-regular';
    import IconFilter from '~icons/fluent/filter-24-regular';
    import IconTag from '~icons/fluent/tag-24-regular';
    
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
    
    interface PendingSubmission {
        id: string;
        title: string;
        description?: string;
        author: string;
        submittedAt: string;
        content: string;
        suggestedTags?: string[];
        initialCheckResult?: SuperEgoCheckResult;
    }
    
    interface SuperEgoCheckResult {
        score: number;
        issues: string[];
        warnings: string[];
        recommendations: string[];
        passedChecks: string[];
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
    
    async function viewSubmission(submission: PendingSubmission) {
        try {
            // In a production app, fetch full details from the API
            const details = await fetchSubmissionDetails(submission.id);
            
            // Merge the details with the submission data
            activeSubmission = {
                ...submission,
                ...details
            };
            
            reviewComment = '';
            addedTags = submission.suggestedTags || [];
            isWhitelisted = true;
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
                    <div class="submission-card" class:flagged={submission.initialCheckResult && (submission.initialCheckResult.issues.length > 0 || submission.initialCheckResult.score < 70)}>
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