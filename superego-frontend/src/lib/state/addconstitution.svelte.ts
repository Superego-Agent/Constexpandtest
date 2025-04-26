<!-- src/lib/components/AddConstitution.svelte -->
<script lang="ts">
    import { fetchConstitutionContent, submitConstitution } from '$lib/api/rest.svelte';
    import { constitutionStore } from '$lib/state/constitutions.svelte';
    import ConstitutionTestingEnvironment from './ConstitutionTestingEnvironment.svelte';
    import { tick } from 'svelte';
    import IconInfoCircle from '~icons/fluent/info-24-regular';
    import IconTestBeaker from '~icons/fluent/beaker-24-regular';
    import { validateConstitutionFormat } from '$lib/utils/constitutionValidator';

    let { onConstitutionAdded = (detail?: { success: boolean }) => {}, onClose = () => {} } = $props<{
        onConstitutionAdded?: (detail?: { success: boolean }) => void;
        onClose?: () => void;
    }>();

    // State for the form
    let constitutionTitle = $state('');
    let constitutionText = $state('');
    let submitForReview = $state(false);
    let isUnlisted = $state(false);
    let selectedTemplateId: string | null = $state(null);
    let showTestingEnvironment = $state(false);
    let formatValidationErrors = $state<string[]>([]);
    let showGuidelines = $state(false);

    // Submission & Loading State
    let isSubmitting = $state(false);
    let isValidating = $state(false);
    let submitStatus: { success?: boolean; message?: string; shareableLink?: string } | null = $state(null);
    let templateLoading = $state(false);

    // Access global state
    let availableConstitutions = $derived(constitutionStore.globalHierarchy);
    let isLoading = $derived(constitutionStore.isLoadingGlobal);
    let error = $derived(constitutionStore.globalError);

    // Get all templates (both remote and local)
    let allConstitutionsForTemplate = $derived((() => {
        const remoteConstitutions = flattenHierarchy(constitutionStore.globalHierarchy);
        const remoteOptions = remoteConstitutions.map((c) => ({ 
            type: 'remote' as const, 
            id: c.relativePath, 
            title: c.title 
        }));

        const localOptions = constitutionStore.localConstitutions.map((c) => ({ 
            type: 'local' as const, 
            id: c.localStorageKey, 
            title: c.title, 
            text: c.text 
        }));

        return [...remoteOptions, ...localOptions].sort((a, b) => a.title.localeCompare(b.title));
    })());

    // Helper function to flatten the hierarchy
    function flattenHierarchy(hierarchy: ConstitutionHierarchy | null): RemoteConstitutionMetadata[] {
        if (!hierarchy) return [];
        
        const constitutions: RemoteConstitutionMetadata[] = [...hierarchy.rootConstitutions];
        
        function recurseFolders(folders: ConstitutionFolder[]) {
            for (const folder of folders) {
                constitutions.push(...folder.constitutions);
                if (folder.subFolders && folder.subFolders.length > 0) {
                    recurseFolders(folder.subFolders);
                }
            }
        }
        
        recurseFolders(hierarchy.rootFolders);
        return constitutions;
    }

    // Load template content when template selection changes
    $effect(() => {
        if (selectedTemplateId) {
            loadTemplateContent(selectedTemplateId);
        }
    });

    async function loadTemplateContent(templateId: string) {
        const selectedTemplate = allConstitutionsForTemplate.find(t => t.id === templateId);
        if (!selectedTemplate) return;

        constitutionTitle = selectedTemplate.title;
        templateLoading = true;
        constitutionText = 'Loading template content...';

        try {
            if (selectedTemplate.type === 'local') {
                constitutionText = selectedTemplate.text;
            } else {
                constitutionText = await fetchConstitutionContent(selectedTemplate.id);
            }
        } catch (error) {
            console.error("Failed to load template content:", error);
            constitutionText = `Error loading template: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            templateLoading = false;
            await tick();
        }
    }

    async function validateFormat() {
        isValidating = true;
        formatValidationErrors = [];
        
        try {
            const result = await validateConstitutionFormat(constitutionText);
            formatValidationErrors = result.errors;
            return result.isValid;
        } catch (error) {
            console.error("Validation error:", error);
            formatValidationErrors = ["An error occurred during validation."];
            return false;
        } finally {
            isValidating = false;
        }
    }

    async function handleSubmit() {
        if (!constitutionTitle.trim() || !constitutionText.trim()) return;
        
        // Validate format first
        const isFormatValid = await validateFormat();
        if (!isFormatValid) {
            return; // Stop submission if format is invalid
        }

        isSubmitting = true;
        submitStatus = null;
        let localAddSuccess = false;
        let submitApiSuccess = false;
        let submitApiMessage = '';
        let newConstitution: LocalConstitutionMetadata | null = null;
        let shareableLink: string | undefined = undefined;

        try {
            // Determine privacy type
            const privacyType = submitForReview 
                ? 'public_review' 
                : (isUnlisted ? 'unlisted' : 'private');
            
            // Add constitution locally
            newConstitution = constitutionStore.addItem(constitutionTitle, constitutionText, privacyType);
            localAddSuccess = true;

            if (submitForReview) {
                // Submit for review if public option is selected
                const response = await submitConstitution({
                    text: constitutionText,
                    is_private: false,
                    is_unlisted: false
                });
                submitApiSuccess = response.status === 'success';
                submitApiMessage = response.message || (submitApiSuccess ? 'Submitted for review.' : 'Submission failed.');
                
                // Track submission for status updates
                if (submitApiSuccess && newConstitution) {
                    constitutionStore.trackSubmission(newConstitution.localStorageKey);
                }
            } else if (isUnlisted) {
                // Generate a shareable link for unlisted constitutions
                shareableLink = await constitutionStore.generateShareableLink(newConstitution.localStorageKey);
                submitApiMessage = 'Constitution saved as unlisted. You can share it using the generated link.';
                
                // Store the link with the constitution
                constitutionStore.updateItem(
                    newConstitution.localStorageKey, 
                    newConstitution.title, 
                    newConstitution.text, 
                    privacyType,
                    shareableLink
                );
                submitApiSuccess = true;
            }

            if (localAddSuccess) {
                submitStatus = {
                    success: true,
                    message: `Constitution '${constitutionTitle}' saved successfully.` + 
                             (submitForReview ? ` ${submitApiMessage}` : '') +
                             (isUnlisted ? ` ${submitApiMessage}` : ''),
                    shareableLink: shareableLink
                };
                
                constitutionTitle = '';
                constitutionText = '';
                selectedTemplateId = null;

                onConstitutionAdded({ success: true });

                // Delay closing only if not unlisted (so user can copy the link)
                if (!isUnlisted) {
                    setTimeout(() => onClose(), 2500);
                }
            } else {
                submitStatus = { success: false, message: 'Failed to save constitution locally.' };
            }
        } catch (error) {
            console.error('Error during constitution save/submit:', error);
            submitStatus = {
                success: false,
                message: `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            };
        } finally {
            isSubmitting = false;
        }
    }

    function openTestingEnvironment() {
        if (!constitutionText.trim()) {
            alert("Please enter constitution text before testing.");
            return;
        }
        showTestingEnvironment = true;
    }
</script>

<div class="add-constitution">
    <h2>Add New Constitution</h2>
    
    <div class="form-group">
        <!-- Template Selection -->
        <div class="form-row">
            <label for="template-select">Use as Template (Optional):</label>
            <select 
                id="template-select" 
                bind:value={selectedTemplateId} 
                disabled={isSubmitting || templateLoading}
            >
                <option value={null}>-- Select Template --</option>
                {#each allConstitutionsForTemplate as template (template.id)}
                    <option value={template.id}>
                        {#if template.type === 'local'}[Local] {/if}{template.title}
                    </option>
                {/each}
            </select>
        </div>

        <!-- Constitution Title -->
        <div class="form-row">
            <label for="constitution-title">Title:</label>
            <input
                type="text"
                id="constitution-title"
                bind:value={constitutionTitle}
                placeholder="Enter a title for your constitution"
                required
                disabled={isSubmitting || templateLoading}
            />
        </div>

        <!-- Format Guidelines Button -->
        <div class="guidelines-toggle">
            <button 
                type="button" 
                class="guidelines-button" 
                onclick={() => showGuidelines = !showGuidelines}
            >
                <IconInfoCircle /> {showGuidelines ? 'Hide' : 'Show'} Format Guidelines
            </button>
        </div>

        <!-- Format Guidelines Panel -->
        {#if showGuidelines}
            <div class="guidelines-panel">
                <h3>Constitution Format Guidelines</h3>
                <p>For best results, your constitution should follow these guidelines:</p>
                <ul>
                    <li><strong>Clear Structure:</strong> Use headings (# for main, ## for sub-sections) to organize content</li>
                    <li><strong>Core Principles:</strong> Start with high-level principles</li>
                    <li><strong>Specific Rules:</strong> Include specific instructions or prohibitions</li>
                    <li><strong>Markdown Format:</strong> Use markdown for formatting (bold, lists, etc.)</li>
                    <li><strong>Reasonable Length:</strong> Keep it concise but comprehensive (500-5000 characters recommended)</li>
                </ul>
                <p>Example structure:</p>
                <pre>
# Constitution Title

## Core Principles
1. First principle
2. Second principle

## Specific Guidelines
* Important guideline
* Another key rule

## Exceptions
Circumstances where rules may be relaxed...
</pre>
            </div>
        {/if}

        <!-- Constitution Text -->
        <textarea
            bind:value={constitutionText}
            placeholder="Enter your constitution text here..."
            rows="12"
            required
            disabled={isSubmitting || templateLoading}
        ></textarea>

        <!-- Validation Errors -->
        {#if formatValidationErrors.length > 0}
            <div class="validation-errors">
                <h4>Format Issues:</h4>
                <ul>
                    {#each formatValidationErrors as error}
                        <li>{error}</li>
                    {/each}
                </ul>
            </div>
        {/if}

        <!-- Privacy Settings Section -->
        <div class="privacy-section">
            <h3 class="section-title">Privacy Settings</h3>
            
            <div class="privacy-options">
                <label class="privacy-option">
                    <input
                        type="radio"
                        name="privacy"
                        value="private"
                        checked={!submitForReview && !isUnlisted}
                        onclick={() => { submitForReview = false; isUnlisted = false; }}
                        disabled={isSubmitting}
                    />
                    <div class="option-content">
                        <span class="option-title">Private</span>
                        <span class="option-description">Only visible to you. Not discoverable by others.</span>
                    </div>
                </label>
                
                <label class="privacy-option">
                    <input
                        type="radio"
                        name="privacy"
                        value="unlisted"
                        checked={isUnlisted}
                        onclick={() => { submitForReview = false; isUnlisted = true; }}
                        disabled={isSubmitting}
                    />
                    <div class="option-content">
                        <span class="option-title">Unlisted</span>
                        <span class="option-description">Not listed publicly, but can be shared via direct link.</span>
                    </div>
                </label>
                
                <label class="privacy-option">
                    <input
                        type="radio"
                        name="privacy"
                        value="public"
                        checked={submitForReview}
                        onclick={() => { submitForReview = true; isUnlisted = false; }}
                        disabled={isSubmitting}
                    />
                    <div class="option-content">
                        <span class="option-title">Submit for Public Review</span>
                        <span class="option-description">If approved, will be listed in the public marketplace.</span>
                    </div>
                </label>
            </div>
        </div>

        {#if submitForReview}
            <div class="review-info">
                <p class="review-note">
                    <strong>Submission Process:</strong> If approved, this constitution may become publicly available in the marketplace.
                </p>
                <ul class="submission-steps">
                    <li>Your constitution will undergo automated checks</li>
                    <li>It will be reviewed by human moderators</li>
                    <li>You'll receive an email notification about approval/rejection</li>
                    <li>Approved constitutions will be whitelisted for MCP server usage</li>
                </ul>
            </div>
        {/if}

        <!-- Status Message -->
        {#if submitStatus}
            <div class="status-message {submitStatus.success ? 'success' : 'error'}">
                <div class="status-header">
                    {#if submitStatus.success}
                        ✓ {submitStatus.message}
                    {:else}
                        ⚠ {submitStatus.message}
                    {/if}
                </div>
                
                {#if submitStatus.success && submitForReview}
                    <p class="status-details">
                        Your constitution has been saved locally and submitted for review. 
                        You'll receive an email notification when the review is complete.
                    </p>
                {/if}
                
                {#if submitStatus.success && isUnlisted && submitStatus.shareableLink}
                    <div class="shareable-link-container">
                        <p class="status-details">Share your constitution using this link:</p>
                        <div class="link-box">
                            <input 
                                type="text" 
                                readonly 
                                value={submitStatus.shareableLink} 
                                class="link-input"
                            />
                            <button 
                                onclick={() => {
                                    navigator.clipboard.writeText(submitStatus.shareableLink || '');
                                    alert('Link copied to clipboard!');
                                }}
                                class="copy-button"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Button Container -->
        <div class="button-container">
            <button
                type="button"
                class="test-button"
                onclick={openTestingEnvironment}
                disabled={!constitutionText.trim() || isSubmitting || templateLoading}
            >
                <IconTestBeaker /> Test Constitution
            </button>
            
            <button
                type="button"
                class="validate-button"
                onclick={validateFormat}
                disabled={!constitutionText.trim() || isSubmitting || templateLoading || isValidating}
            >
                {isValidating ? 'Validating...' : 'Validate Format'}
            </button>
            
            <button
                type="button"
                class="submit-button"
                onclick={handleSubmit}
                disabled={!constitutionTitle.trim() || !constitutionText.trim() || isSubmitting || templateLoading || isValidating}
            >
                {#if isSubmitting}
                    Saving...
                {:else}
                    Save Constitution
                {/if}
            </button>
        </div>
    </div>
</div>

<!-- Testing Environment Modal -->
{#if showTestingEnvironment}
    <div class="testing-modal-overlay">
        <div class="testing-modal-content">
            <ConstitutionTestingEnvironment 
                constitutionText={constitutionText}
                onClose={() => showTestingEnvironment = false}
            />
        </div>
    </div>
{/if}

<style lang="scss">
    @use '../styles/mixins' as *;

    .add-constitution {
        padding: 0;
        width: 100%;
        margin: 0;
        height: 100%;
        overflow-y: auto;
        @include custom-scrollbar($track-bg: var(--bg-elevated));
    }

    h2 {
        color: var(--text-primary);
        margin-bottom: 20px;
        font-size: 1.2em;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .form-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    label {
        font-size: 0.9em;
        color: var(--text-secondary);
    }

    input[type="text"],
    select,
    textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--input-border);
        border-radius: var(--radius-sm);
        background: var(--bg-surface);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.95em;
    }

    input[type="text"]:focus,
    select:focus,
    textarea:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px var(--primary-lightest);
    }

    textarea {
        resize: vertical;
        min-height: 150px;
        font-family: 'Courier New', monospace;
    }

    select {
        cursor: pointer;
    }

    .guidelines-toggle {
        display: flex;
        justify-content: flex-start;
    }

    .guidelines-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        color: var(--primary);
        font-size: 0.9em;
        cursor: pointer;
        padding: 0;
    }

    .guidelines-panel {
        background-color: var(--bg-hover);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        padding: 16px;
        font-size: 0.9em;

        h3 {
            margin-top: 0;
            margin-bottom: 10px;
            font-size: 1.1em;
        }

        p {
            margin-bottom: 10px;
        }

        ul {
            margin-left: 20px;
            margin-bottom: 10px;
        }

        pre {
            background-color: var(--bg-elevated);
            padding: 10px;
            border-radius: var(--radius-sm);
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
    }

    .validation-errors {
        background-color: var(--error-bg);
        border: 1px solid var(--error-border);
        border-radius: var(--radius-sm);
        padding: 12px;
        font-size: 0.9em;

        h4 {
            margin-top: 0;
            margin-bottom: 8px;
            color: var(--error);
        }

        ul {
            margin-left: 20px;
            margin-bottom: 0;
        }

        li {
            color: var(--error);
        }
    }

    .privacy-section {
        margin-top: var(--space-md);
        border-top: 1px solid var(--input-border);
        padding-top: var(--space-md);
    }

    .section-title {
        font-size: 1em;
        margin-bottom: var(--space-sm);
        color: var(--text-primary);
    }

    .privacy-options {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .privacy-option {
        display: flex;
        align-items: flex-start;
        gap: var(--space-sm);
        padding: var(--space-sm);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s ease;
        
        &:hover {
            background-color: var(--bg-hover);
        }
        
        input[type="radio"] {
            margin-top: 3px;
            flex-shrink: 0;
            accent-color: var(--primary);
        }
    }

    .option-content {
        display: flex;
        flex-direction: column;
    }

    .option-title {
        font-weight: 600;
        font-size: 0.95em;
    }

    .option-description {
        font-size: 0.85em;
        color: var(--text-secondary);
    }

    .review-info {
        padding: 12px 16px;
        background-color: var(--info-bg, #e6f7ff);
        border: 1px solid var(--info-border, #91d5ff);
        border-radius: var(--radius-sm);
        font-size: 0.9em;
        margin-top: 8px;
    }

    .submission-steps {
        margin-top: 8px;
        padding-left: 20px;
        font-size: 0.85em;
    }

    .button-container {
        display: flex;
        gap: var(--space-md);
        margin-top: 8px;
        flex-wrap: wrap;
    }

    .test-button, .validate-button {
        padding: 10px 15px;
        background-color: var(--secondary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.95em;
        transition: background-color 0.2s, opacity 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
        
        &:hover:not(:disabled) {
            background-color: var(--secondary-light);
        }
        
        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .submit-button {
        padding: 10px 20px;
        background-color: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.95em;
        transition: background-color 0.2s, opacity 0.2s;
        margin-left: auto;
        
        &:hover:not(:disabled) {
            background-color: var(--primary-light);
        }
        
        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .status-message {
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        font-size: 0.9em;
        margin-top: 8px;
    }

    .status-message.success {
        background-color: var(--success-bg, #e6f4ea);
        color: var(--success-text, #1e4620);
        border: 1px solid var(--success-border, #a7d7ae);
    }

    .status-message.error {
        background-color: var(--error-bg, #fce8e6);
        color: var(--error-text, #c5221f);
        border: 1px solid var(--error-border, #f4a9a8);
    }

    .status-header {
        font-weight: 600;
        margin-bottom: 6px;
    }

    .status-details {
        font-size: 0.9em;
        margin-top: 4px;
    }
    
    .shareable-link-container {
        margin-top: var(--space-sm);
    }
    
    .link-box {
        display: flex;
        margin-top: 4px;
    }
    
    .link-input {
        flex-grow: 1;
        font-size: 0.85em;
        padding: 6px 8px;
        background-color: var(--bg-elevated);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-sm) 0 0 var(--radius-sm);
        color: var(--text-primary);
    }
    
    .copy-button {
        padding: 6px 12px;
        background-color: var(--secondary);
        color: white;
        border: none;
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        cursor: pointer;
        font-size: 0.85em;
        transition: background-color 0.2s;
        
        &:hover {
            background-color: var(--secondary-light);
        }
    }
    
    .testing-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--space-md);
    }
    
    .testing-modal-content {
        width: 100%;
        max-width: 800px;
        height: 80vh;
        background-color: var(--bg-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        overflow: hidden;
    }
</style>