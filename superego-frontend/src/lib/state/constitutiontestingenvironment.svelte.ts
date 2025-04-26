<script lang="ts">
    import { onMount } from 'svelte';
    import { streamRun } from '$lib/api/sse.svelte';
    import { constitutionStore } from '$lib/state/constitutions.svelte';
    import MessageCard from './MessageCard.svelte';
    import IconRefresh from '~icons/fluent/arrow-clockwise-24-regular';
    import IconSend from '~icons/fluent/send-24-regular';
    import IconStop from '~icons/fluent/stop-24-regular';
    
    // --- Props ---
    let { constitutionText, onClose } = $props<{
        constitutionText: string;
        onClose?: () => void;
    }>();
    
    // --- Component State ---
    let isStreaming = $state(false);
    let userInput = $state('');
    let messages = $state<MessageType[]>([
        {
            type: 'system',
            content: 'This is a testing environment. The AI will respond according to the constitution you\'ve provided. Your interactions here won\'t be saved permanently.',
            nodeId: 'system-init'
        }
    ]);
    let abortController: AbortController | null = $state(null);
    let error = $state<string | null>(null);
    
    // Helper function for reset
    function resetTestEnvironment() {
        // Stop any ongoing streams
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
        
        // Reset messages to initial state
        messages = [
            {
                type: 'system',
                content: 'This is a testing environment. The AI will respond according to the constitution you\'ve provided. Your interactions here won\'t be saved permanently.',
                nodeId: 'system-init'
            }
        ];
        
        isStreaming = false;
        error = null;
    }
    
    // Function to submit user message to test the constitution
    async function handleSubmit() {
        if (!userInput.trim() || isStreaming) return;
        
        // Add user message to the conversation
        messages = [
            ...messages,
            {
                type: 'human',
                content: userInput,
                nodeId: `user-${Date.now()}`
            }
        ];
        
        const message = userInput;
        userInput = ''; // Clear input field
        isStreaming = true;
        error = null;
        
        try {
            // Create a test run config with just this constitution
            const testRunConfig: RunConfig = {
                configuredModules: [
                    {
                        title: 'Test Constitution',
                        adherence_level: 5, // Maximum adherence for testing
                        text: constitutionText
                    }
                ]
            };
            
            // Start streaming with this configuration
            abortController = await streamRun(message, testRunConfig, null);
            
            // Create a placeholder for AI response while streaming
            messages = [
                ...messages,
                {
                    type: 'ai',
                    content: '',
                    nodeId: `ai-stream-${Date.now()}`,
                    tool_calls: []
                }
            ];
            
            // The actual message content will be updated by the stream handler in sse.svelte.ts
            
        } catch (err) {
            console.error('Error starting test run:', err);
            error = `Error: ${err instanceof Error ? err.message : String(err)}`;
            isStreaming = false;
        }
    }
    
    // Function to handle stopping an ongoing stream
    function handleStopStream() {
        if (abortController) {
            abortController.abort();
            abortController = null;
            isStreaming = false;
        }
    }
    
    // Make sure to stop any ongoing streams when the component is destroyed
    onMount(() => {
        return () => {
            if (abortController) {
                abortController.abort();
            }
        };
    });
</script>

<div class="testing-environment">
    <div class="testing-header">
        <h2>Constitution Testing Environment</h2>
        <div class="header-controls">
            <button class="reset-button" onclick={resetTestEnvironment} title="Reset the testing environment">
                <IconRefresh /> Reset
            </button>
            <button class="close-button" onclick={onClose} title="Close the testing environment">
                Close
            </button>
        </div>
    </div>
    
    <div class="testing-description">
        <p>This sandbox allows you to test how your constitution will guide AI responses before submission. Try asking questions or requesting content that would test the boundaries of your guidelines.</p>
    </div>
    
    {#if error}
        <div class="error-banner">
            {error}
        </div>
    {/if}
    
    <div class="messages-container">
        {#each messages as message (message.nodeId)}
            <MessageCard {message} />
        {/each}
    </div>
    
    <div class="input-container">
        <textarea
            bind:value={userInput}
            placeholder="Type a message to test your constitution..."
            onkeydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                }
            }}
            disabled={isStreaming}
        ></textarea>
        
        <div class="button-container">
            {#if isStreaming}
                <button class="stop-button" onclick={handleStopStream}>
                    <IconStop /> Stop
                </button>
            {:else}
                <button 
                    class="send-button" 
                    onclick={handleSubmit}
                    disabled={!userInput.trim()}
                >
                    <IconSend /> Test
                </button>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    @use '../styles/mixins' as *;

    .testing-environment {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background-color: var(--bg-surface);
        border-radius: var(--radius-lg);
        overflow: hidden;
    }

    .testing-header {
        padding: var(--space-md);
        background-color: var(--bg-elevated);
        border-bottom: 1px solid var(--input-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        
        h2 {
            margin: 0;
            font-size: 1.2rem;
            color: var(--text-primary);
        }
        
        .header-controls {
            display: flex;
            gap: var(--space-sm);
        }
    }

    .reset-button, .close-button {
        padding: 6px 12px;
        border-radius: var(--radius-md);
        font-size: 0.85rem;
        background-color: var(--bg-surface);
        border: 1px solid var(--input-border);
        color: var(--text-primary);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        
        &:hover {
            background-color: var(--bg-hover);
        }
    }

    .testing-description {
        padding: var(--space-md);
        border-bottom: 1px solid var(--input-border);
        background-color: var(--bg-surface);
        
        p {
            margin: 0;
            font-size: 0.9rem;
            color: var(--text-secondary);
        }
    }

    .error-banner {
        padding: var(--space-sm) var(--space-md);
        background-color: var(--error-bg);
        color: var(--error);
        font-size: 0.9rem;
        border-bottom: 1px solid var(--error-border);
    }

    .messages-container {
        flex-grow: 1;
        overflow-y: auto;
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        @include custom-scrollbar();
    }

    .input-container {
        padding: var(--space-md);
        border-top: 1px solid var(--input-border);
        background-color: var(--bg-surface);
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    textarea {
        width: 100%;
        min-height: 80px;
        padding: var(--space-sm);
        border: 1px solid var(--input-border);
        border-radius: var(--radius-md);
        resize: vertical;
        font-family: inherit;
        font-size: 0.95rem;
        
        &:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 2px var(--primary-lightest);
        }
        
        &:disabled {
            background-color: var(--bg-elevated);
            cursor: not-allowed;
        }
    }

    .button-container {
        display: flex;
        justify-content: flex-end;
    }

    .send-button, .stop-button {
        padding: 8px 16px;
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        cursor: pointer;
    }

    .send-button {
        background-color: var(--primary);
        color: white;
        
        &:hover:not(:disabled) {
            background-color: var(--primary-light);
        }
        
        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .stop-button {
        background-color: var(--error);
        color: white;
        
        &:hover {
            background-color: color-mix(in srgb, var(--error) 85%, white);
        }
    }
</style>