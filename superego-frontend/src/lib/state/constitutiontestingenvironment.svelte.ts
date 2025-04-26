<script lang="ts">
    import { onMount } from 'svelte';
    import { streamRun } from '$lib/api/sse.svelte';
    import MessageCard from './MessageCard.svelte';
    import IconRefresh from '~icons/fluent/arrow-clockwise-24-regular';
    import IconSend from '~icons/fluent/send-24-regular';
    import IconStop from '~icons/fluent/stop-24-regular';
    import IconSettings from '~icons/fluent/settings-24-regular';
    
    // Props
    const { constitutionText, onClose = () => {} } = $props<{
        constitutionText: string;
        onClose?: () => void;
    }>();
    
    // Component State
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
    let adherenceLevel = $state(5); // Default to maximum adherence
    let showSettings = $state(false);
    
    // Reset the test environment
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
                        adherence_level: adherenceLevel,
                        text: constitutionText
                    }
                ]
            };
            
            // Start streaming with this configuration - pass true for test mode
            abortController = await streamRun(message, testRunConfig, null, true);
            
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
            <button 
                class="settings-button" 
                title="Test Settings" 
                onclick={() => showSettings = !showSettings}
                class:active={showSettings}
            >
                <IconSettings />
            </button>
            <button class="reset-button" onclick={resetTestEnvironment} title="Reset the testing environment">
                <IconRefresh /> Reset
            </button>
            <button class="close-button" onclick={onClose} title="Close the testing environment">
                Close
            </button>
        </div>
    </div>
    
    <div class="testing-description">
        <p>This sandbox allows you to test how your constitution will guide AI responses. Try asking questions or requesting content that would test the boundaries of your guidelines.</p>
    </div>
    
    {#if showSettings}
        <div class="settings-panel">
            <div class="adherence-setting">
                <label for="adherence-level">Adherence Level: {adherenceLevel}/5</label>
                <input 
                    type="range" 
                    id="adherence-level" 
                    min="1" 
                    max="5" 
                    bind:value={adherenceLevel} 
                    class="adherence-slider"
                    title="Adjust adherence level" 
                />
                <div class="adherence-levels">
                    <span class="level-marker">1</span>
                    <span class="level-marker">2</span>
                    <span class="level-marker">3</span>
                    <span class="level-marker">4</span>
                    <span class="level-marker">5</span>
                </div>
                <div class="adherence-explanation">
                    <span class="lower">Lower: More flexible, may overlook constraints</span>
                    <span class="higher">Higher: More strict, closer adherence to constitution</span>
                </div>
            </div>
        </div>
    {/if}
    
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