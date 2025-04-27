// src/lib/api/sse.svelte.ts

import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source';
import { threadStore } from '$lib/state/threads.svelte';
import { activeStore } from '$lib/state/active.svelte'; 
import { sessionStore } from '../state/session.svelte';
import { getLatestHistory } from './rest.svelte'; 

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// --- Error Handling Utilities ---

/**
 * Handles errors from async operations, ignoring AbortError since those are expected during cancellation
 * @param error The error to handle
 * @param message A descriptive message prefix for logging and user feedback
 * @param threadId Optional threadId for contextual error messages
 * @returns true if the error was an AbortError (was handled quietly), false otherwise
 */
function handleNonAbortError(error: unknown, message: string, threadId?: string | null): boolean {
  const contextMsg = threadId ? `[Thread ${threadId}] ` : '';
  
  if (error instanceof DOMException && error.name === 'AbortError') {
    console.log(`${contextMsg}Operation aborted: ${message}`);
    return true; // Abort errors are expected during cancellation
  }
  
  // For all other errors, log and set global error
  console.error(`${contextMsg}${message}:`, error);
  const errorMsg = error instanceof Error ? error.message : String(error);
  activeStore.setGlobalError(`${message}: ${errorMsg}`);
  return false;
}

// --- Stream Event Handlers ---

/**
 * Updates a message with new content from a chunk event
 */
function handleChunk(historyEntry: HistoryEntry, chunkData: SSEChunkData): void {
  const messages = historyEntry.values.messages;
  const lastMessageNodeId = messages.at(-1)?.nodeId;

  // Create new AI message if node changes or message list is empty  
  if (lastMessageNodeId !== chunkData.node) {
    messages.push({
      type: 'ai',
      content: '',
      nodeId: chunkData.node,
      tool_calls: [] // Initialize tool_calls for potential subsequent tool chunks
    });
  }

  const lastMessage = messages.at(-1);
  // Append content if last message is AI and from the same node
  if (lastMessage && lastMessage.type === 'ai') {
    if (typeof lastMessage.content !== 'string') {
      console.warn("Appending chunk to non-string AI content, converting existing content.");
      lastMessage.content = String(lastMessage.content);
    }
    lastMessage.content += chunkData.content;
  } else if (lastMessage) {
    // Handle unexpected case: chunk received after non-AI message from same node
    messages.push({
      type: 'ai',
      content: chunkData.content,
      nodeId: chunkData.node,
      tool_calls: []
    });
    console.warn("Received chunk after non-AI message from same node. Creating new AI message.");
  }
}

/**
 * Updates an AI message with tool call information from an ai_tool_chunk event
 */
function handleToolChunk(historyEntry: HistoryEntry, toolChunkData: SSEToolCallChunkData): void {
  const messages = historyEntry.values.messages;
  let lastMessage = messages.at(-1);
  const sameNode = lastMessage?.nodeId === toolChunkData.node;

  // Create new AI message if node changes, message list is empty, or last message isn't AI
  if (!lastMessage || !sameNode || lastMessage.type !== 'ai') {
    const newAiMessage: AiApiMessage = {
      type: 'ai',
      content: '',
      nodeId: toolChunkData.node,
      tool_calls: []
    };
    
    messages.push(newAiMessage);
    lastMessage = newAiMessage;
    
    if (sameNode && lastMessage.type !== 'ai') {
      console.warn("Received ai_tool_chunk after non-AI message from same node. Creating new AI message.");
    }
  }

  // Ensure tool_calls array exists
  if (!lastMessage.tool_calls) {
    lastMessage.tool_calls = [];
  }

  // Process the tool chunk data
  if (toolChunkData.id) {
    // New tool call
    lastMessage.tool_calls.push({
      id: toolChunkData.id,
      name: toolChunkData.name || '',
      args: toolChunkData.args || ''
    });
  } else if (toolChunkData.args && lastMessage.tool_calls.length > 0) {
    // Append to existing tool call args
    const lastToolCall = lastMessage.tool_calls.at(-1);
    if (lastToolCall) {
      lastToolCall.args += toolChunkData.args;
    } else {
      console.error("Received tool chunk args, but no existing tool call structure found on the message.", lastMessage);
    }
  }
}

/**
 * Adds a ToolApiMessage based on a tool_result event
 */
function handleToolResult(historyEntry: HistoryEntry, toolResultData: SSEToolResultData): void {
  const newToolMessage: ToolApiMessage = {
    type: 'tool',
    content: toolResultData.content ?? '',
    tool_call_id: String(toolResultData.tool_call_id ?? ''),
    name: toolResultData.tool_name,
    nodeId: toolResultData.node,
    is_error: toolResultData.is_error
  };

  historyEntry.values.messages.push(newToolMessage);
}

/**
 * Handles the initial run_start event that sets up the stream run
 */
function handleRunStartEvent(
  startData: SSERunStartData,
  currentActiveSessionId: string,
  threadIdToSend: string | null // This is the ID we *sent* the request with (null if new)
): void {
  const targetThreadId = startData.thread_id; // This is the ID the backend *confirmed* or created

  // Get existing cache if present
  const existingEntry = threadStore.threadCacheStore[targetThreadId];
  
  // Determine initial messages, merging any existing with new ones from the event
  let updatedMessages: MessageType[];
  if (existingEntry?.history?.values?.messages) {
    const existingMessages = existingEntry.history.values.messages;
    const newMessages = startData.initialMessages.filter(
      newMsg => !existingMessages.some(existingMsg =>
        existingMsg.type === newMsg.type && existingMsg.content === newMsg.content
      )
    );
    updatedMessages = [...existingMessages, ...newMessages];
  } else {
    updatedMessages = startData.initialMessages;
  }

  // Create the updated cache entry
  const newCacheEntry: ThreadCacheData = {
    history: {
      checkpoint_id: existingEntry?.history?.checkpoint_id || '',
      thread_id: targetThreadId,
      values: { messages: updatedMessages },
      runConfig: startData.runConfig
    },
    status: 'streaming',
    error: null
  };

  // Update thread cache
  threadStore.setEntry(targetThreadId, newCacheEntry);

  // Mark thread as having history on the backend
  sessionStore.addThreadIdWithBackendHistory(targetThreadId); 

  // If this is a new thread (threadIdToSend was null), add it to the session
  if (threadIdToSend === null) {
    console.log(`Received run_start for new thread ID: ${targetThreadId} for session ${currentActiveSessionId}`);
    sessionStore.addThreadToSession(currentActiveSessionId, targetThreadId);
  } else if (threadIdToSend !== targetThreadId) {
    // Log warning if thread IDs don't match (unusual case)
    console.warn(`run_start thread ID ${targetThreadId} differs from requested thread ID ${threadIdToSend}`);
  }
}

/**
 * Handles streaming updates (chunk, ai_tool_chunk, tool_result)
 */
function handleStreamUpdateEvent(
  eventType: 'chunk' | 'ai_tool_chunk' | 'tool_result',
  eventData: SSEChunkData | SSEToolCallChunkData | SSEToolResultData,
  targetThreadId: string
): void {
  // Get current cache entry
  const currentCacheEntry = threadStore.threadCacheStore[targetThreadId];

  // Validate cache entry exists and is in correct state
  if (!currentCacheEntry) {
    console.error(`Received '${eventType}' for thread ${targetThreadId}, but no cache entry found. Was 'run_start' missed?`);
    return;
  }

  if (currentCacheEntry.status !== 'streaming' || currentCacheEntry.error) {
    console.warn(`Ignoring '${eventType}' for thread ${targetThreadId} because stream is not active or has an error.`);
    return;
  }

  // Create shallow copy of history for immutable update pattern
  if (!currentCacheEntry.history) {
    console.error(`Thread ${targetThreadId} has no history to update.`);
    return;
  }
  
  // Create immutable copy with nested structure for messages
  const updatedHistory = {
    ...currentCacheEntry.history,
    values: {
      ...currentCacheEntry.history.values,
      messages: [...currentCacheEntry.history.values.messages]  // Copy messages array for mutation
    }
  };

  try {
    // Apply the appropriate update
    if (eventType === 'chunk') {
      handleChunk(updatedHistory, eventData as SSEChunkData);
    } else if (eventType === 'ai_tool_chunk') {
      handleToolChunk(updatedHistory, eventData as SSEToolCallChunkData);
    } else {
      handleToolResult(updatedHistory, eventData as SSEToolResultData);
    }

    // Update thread cache with modified history
    threadStore.updateEntry(targetThreadId, { history: updatedHistory });
  } catch (error: unknown) {
    const errorMsg = `Error processing '${eventType}' in streamProcessor`;
    handleNonAbortError(error, errorMsg, targetThreadId);
  }
}

/**
 * Handles error events from the SSE stream
 */
function handleErrorEvent(
  errorData: SSEErrorData,
  targetThreadId: string | null
): void {
  const errorMessage = `Backend Error (${errorData.node}): ${errorData.error}`;
  console.error(`SSE Error Event Received (Thread: ${targetThreadId ?? 'N/A'}):`, errorMessage);
  activeStore.setGlobalError(errorMessage);

  // Update thread cache if we have a valid thread ID
  if (targetThreadId) {
    threadStore.updateEntry(targetThreadId, { status: 'error', error: errorMessage });
  }
}

/**
 * Handles the final 'end' event, fetching the latest state from the backend
 */
async function handleEndEvent(
  endData: SSEEndData,
  targetThreadId: string,
  controller: AbortController
): Promise<void> {
  console.log(`SSE stream ended for thread ${targetThreadId}. Final Checkpoint: ${endData.checkpoint_id}`);
  
  const MAX_RETRIES = 2;
  let retryCount = 0;
  let success = false;
  
  // Update to idle status immediately to enable the UI to respond
  threadStore.updateEntry(targetThreadId, { status: 'idle' });
  
  // Try to fetch final state, with retries
  while (retryCount <= MAX_RETRIES && !success) {
    try {
      const finalHistoryEntry = await getLatestHistory(targetThreadId, controller.signal);
      
      // Update thread cache with final state
      threadStore.updateEntry(targetThreadId, { 
        history: finalHistoryEntry, 
        status: 'idle', 
        error: null 
      });
      
      console.log(`Cache updated with final state for thread ${targetThreadId}`);
      success = true;
    } catch (error: unknown) {
      retryCount++;
      
      // Handle abort errors immediately
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log(`Fetch of final state for thread ${targetThreadId} was aborted.`);
        break;
      }
      
      // Retry or give up
      if (retryCount <= MAX_RETRIES) {
        console.log(`Retrying fetch of final state for thread ${targetThreadId} (attempt ${retryCount})...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      } else {
        // Final failure
        handleNonAbortError(error, `Failed to fetch final state for thread ${targetThreadId}`, targetThreadId);
      }
    }
  }
}

// --- Event Handler Registry ---

const eventHandlers: Record<string, Function> = {
  'run_start': handleRunStartEvent,
  'chunk': handleStreamUpdateEvent,
  'ai_tool_chunk': handleStreamUpdateEvent,
  'tool_result': handleStreamUpdateEvent,
  'error': handleErrorEvent,
  'end': handleEndEvent
};

// --- Public API ---

/**
 * Initiates a stream run for the active session.
 * Handles sending the request and processing SSE events.
 * Updates the thread cache with streaming data.
 * 
 * @param userInput - The user's message to send to the backend
 * @param runConfig - The configuration for this run
 * @param threadId - The thread ID to use, or null for a new thread
 * @param isTestMode - Whether this is a test run (doesn't require a session)
 * @returns An AbortController that can be used to cancel the stream
 */
export async function streamRun(
  userInput: string,
  runConfig: RunConfig,
  threadId: string | null,
  isTestMode: boolean = false
): Promise<AbortController> {
  // Clear any previous error
  activeStore.clearGlobalError();
  
  // Create abort controller for cancellation
  const controller = new AbortController();
  
  // Get current session information
  let currentActiveSessionId: string | null = null;
  
  if (!isTestMode) {
    currentActiveSessionId = sessionStore.activeSessionId;
    
    // Validate active session
    if (!currentActiveSessionId) {
      const errorMsg = "Cannot start run: No active session selected.";
      console.error(errorMsg);
      activeStore.setGlobalError(errorMsg); 
      controller.abort();
      return controller;
    }
    
    // Validate session data
    const currentSessionData = sessionStore.uiSessions[currentActiveSessionId];
    if (!currentSessionData) {
      const errorMsg = `Cannot start run: Active session state not found for ID ${currentActiveSessionId}.`;
      console.error(errorMsg);
      activeStore.setGlobalError(errorMsg); 
      controller.abort();
      return controller;
    }
  }
  
  // Prepare request data
  const threadIdToSend: string | null = threadId;
  const checkpointConfigurable: CheckpointConfigurable = {
    thread_id: threadIdToSend,
    runConfig: runConfig,
  };
  
  const requestBody = {
    input: { type: 'human', content: userInput },
    configurable: checkpointConfigurable,
    is_test_mode: isTestMode
  };
  
  // Log this operation without exposing too much detail about the request
  console.log(`Starting stream run for ${isTestMode ? 'test mode' : `session ${currentActiveSessionId}`} (Thread: ${threadIdToSend ?? 'NEW'})`);
  
  try {
    // Start SSE connection
    await fetchEventSource(`${BASE_URL}/runs/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      openWhenHidden: true, // Continue receiving events when tab is not visible
      
      // Handle SSE connection open
      onopen: async (response) => {
        if (!response.ok) {
          let errorMsg = `SSE connection failed! Status: ${response.status}`;
          try { 
            const errorBody = await response.json(); 
            errorMsg += ` - ${errorBody.detail || JSON.stringify(errorBody)}`; 
          } catch (e) { /* Ignore parsing errors */ }
          
          activeStore.setGlobalError(`Connection Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        console.log(`SSE stream opened for ${isTestMode ? 'test mode' : `session ${currentActiveSessionId}`}`);
      },
      
      // Handle SSE messages
      onmessage: (event: EventSourceMessage) => {
        try {
          // Skip empty messages
          if (!event.data) { 
            console.warn('SSE message received with no data.');
            return;
          }
          
          // Parse event data
          const parsedEvent: SSEEventData = JSON.parse(event.data);
          const eventType = parsedEvent.type;
          const eventData = parsedEvent.data;
          const eventThreadId = parsedEvent.thread_id;
          
          // Determine target thread ID (from event or from request)
          const targetThreadId = eventThreadId || threadIdToSend;
          
          // Validate thread ID for all events except 'error' which can be handled without it
          if (!targetThreadId && eventType !== 'error') {
            console.error(`SSE event type '${eventType}' received without a usable thread_id. Cannot process.`, parsedEvent);
            activeStore.setGlobalError(`System Error: Event '${eventType}' missing thread_id.`);
            return;
          }
          
          // Get the appropriate handler for this event type
          const handler = eventHandlers[eventType];
          if (!handler) {
            console.warn('Unhandled SSE event type:', eventType, parsedEvent);
            return;
          }
          
          // Call the handler with appropriate context
          if (eventType === 'run_start') {
            if (isTestMode) {
              // For test mode, create a temporary thread cache entry
              const newCacheEntry: ThreadCacheData = {
                history: {
                  checkpoint_id: 'test-checkpoint',
                  thread_id: targetThreadId || 'test-thread',
                  values: { messages: eventData.initialMessages || [] },
                  runConfig: eventData.runConfig
                },
                status: 'streaming',
                error: null
              };
              threadStore.setEntry(targetThreadId || 'test-thread', newCacheEntry);
            } else {
              handler(eventData as SSERunStartData, currentActiveSessionId, threadIdToSend);
            }
          } else if (eventType === 'chunk' || eventType === 'ai_tool_chunk' || eventType === 'tool_result') {
            if (targetThreadId) {
              handler(eventType, eventData as any, targetThreadId);
            } else {
              console.error(`Cannot process '${eventType}' without targetThreadId.`, parsedEvent);
              activeStore.setGlobalError(`System Error: Cannot process '${eventType}' without thread ID.`);
            }
          } else if (eventType === 'error') {
            handler(eventData as SSEErrorData, targetThreadId);
          } else if (eventType === 'end') {
            if (targetThreadId) {
              // Call async handler without awaiting
              handler(eventData as SSEEndData, targetThreadId, controller)
                .catch(err => {
                  console.error("Error in async end handler:", err);
                  activeStore.setGlobalError("Error finalizing stream state.");
                });
            } else {
              console.error(`Cannot process 'end' without targetThreadId.`, parsedEvent);
              activeStore.setGlobalError(`System Error: Cannot process 'end' without thread ID.`);
            }
          }
        } catch (error: unknown) {
          handleNonAbortError(error, 'Failed to process SSE message');
        }
      },
      
      // Handle SSE connection close
      onclose: () => {
        console.log(`SSE stream closed for ${isTestMode ? 'test mode' : `session ${currentActiveSessionId}`}.`);
      },
      
      // Handle SSE connection error
      onerror: (err) => {
        if (controller.signal.aborted) { return; }
        
        console.error(`SSE stream error for ${isTestMode ? 'test mode' : `session ${currentActiveSessionId}`}:`, err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        activeStore.setGlobalError(`Stream Error: ${errorMsg}`);
        // Don't throw from onerror to allow graceful closure
      },
    });
  } catch (error) {
    handleNonAbortError(error, 'Error establishing SSE connection');
  }
  
  return controller;
}