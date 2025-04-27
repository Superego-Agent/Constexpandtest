import { logExecution } from '../utils/utils'; 
import { activeStore } from '$lib/state/active.svelte';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// --- Core API Fetch Helper ---

/**
 * Generic fetch wrapper for API calls, handling errors and JSON parsing.
 * Sets global error state via appState.
 */
async function apiFetch<T>(url: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
	activeStore.clearGlobalError(); // Use method

	try {
		const response = await fetch(url, {
			...options,
			signal,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			let errorMsg = `HTTP error! Status: ${response.status}`;
			try {
				const errorText = await response.text();
				try {
					const errorBody = JSON.parse(errorText);
					errorMsg += ` - ${errorBody.detail || JSON.stringify(errorBody)}`;
				} catch (parseError) {
					errorMsg += ` - ${errorText}`;
				}
			} catch (e) {
				/* Ignore */
			}
			throw new Error(errorMsg);
		}

		if (response.status === 204) {
			// Handle No Content response
			return undefined as T;
		}

		// Assume JSON response otherwise
		return (await response.json()) as T;
	} catch (error: unknown) {
		if (!(error instanceof DOMException && error.name === 'AbortError')) {
			console.error('API Fetch Error:', url, error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			activeStore.setGlobalError(errorMsg || 'An unknown API error occurred.'); // Use method
			throw error; // Re-throw after setting global state
		} else {
			console.log('API Fetch aborted:', url);
			throw error; // Re-throw abort error
		}
	}
}


// --- Constitution API Functions ---

/**
 * Fetches the list of available global constitutions.
 */
export const fetchConstitutionHierarchy = (signal?: AbortSignal): Promise<ConstitutionHierarchy> => {
	return logExecution('Fetch constitution hierarchy', () =>
		apiFetch<ConstitutionHierarchy>(`${BASE_URL}/constitutions`, {}, signal)
	);
};

/**
 * Fetches the full text content of a specific global constitution.
 * Uses raw fetch as the endpoint returns plain text, not JSON.
 */
export const fetchConstitutionContent = (relativePath: string, signal?: AbortSignal): Promise<string> => {
	return logExecution(`Fetch content for constitution ${relativePath}`, async () => {
		activeStore.clearGlobalError(); // Use method
		try {
			const response = await fetch(`${BASE_URL}/constitutions/${encodeURIComponent(relativePath)}/content`, {
				signal,
				headers: { Accept: 'text/plain' } // Request plain text
			});
			if (!response.ok) {
				let errorMsg = `HTTP error! Status: ${response.status}`;
				try {
					const errorText = await response.text();
					errorMsg += ` - ${errorText}`;
				} catch (e) {
					/* Ignore */
				}
				throw new Error(errorMsg);
			}
			return await response.text();
		} catch (error: unknown) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				console.error(`API Fetch Error (Text): ${BASE_URL}/constitutions/${encodeURIComponent(relativePath)}/content`, error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				activeStore.setGlobalError(errorMsg || 'An unknown API error occurred fetching constitution content.'); // Use method
				throw error;
			} else {
				console.log(`API Fetch aborted: ${BASE_URL}/constitutions/${encodeURIComponent(relativePath)}/content`);
				throw error;
			}
		}
	});
};


/**
 * Submits a new constitution for review.
 */
export const submitConstitution = (
	payload: ConstitutionSubmission,
	signal?: AbortSignal
): Promise<SubmissionResponse> => {
	return logExecution('Submit constitution for review', () =>
		apiFetch<SubmissionResponse>(
			`${BASE_URL}/constitutions`,
			{
				method: 'POST',
				body: JSON.stringify(payload)
			},
			signal
		)
	);
};

/**
 * Tests a constitution in a sandbox environment without saving it.
 */
export const testConstitution = (
    constitutionText: string,
    userInput: string,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution('Test constitution in sandbox', () =>
        apiFetch<any>(
            `${BASE_URL}/constitutions/test`,
            {
                method: 'POST',
                body: JSON.stringify({
                    constitution_text: constitutionText,
                    user_input: userInput
                })
            },
            signal
        )
    );
};

/**
 * Fetches the list of approved constitutions from the marketplace.
 */
export const fetchMarketplaceConstitutions = (
    filters?: { 
        tags?: string[], 
        search?: string, 
        sort?: 'popular' | 'recent' | 'alphabetical' 
    },
    signal?: AbortSignal
): Promise<any[]> => {
    // Build query parameters based on filters
    const params = new URLSearchParams();
    if (filters?.tags?.length) {
        filters.tags.forEach(tag => params.append('tag', tag));
    }
    if (filters?.search) {
        params.append('search', filters.search);
    }
    if (filters?.sort) {
        params.append('sort', filters.sort);
    }
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    
    return logExecution('Fetch marketplace constitutions', () =>
        apiFetch<any[]>(`${BASE_URL}/marketplace/constitutions${queryString}`, {}, signal)
    );
};

/**
 * Fetches detailed information about a specific marketplace constitution.
 */
export const fetchMarketplaceConstitutionDetails = (
    constitutionId: string,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Fetch details for marketplace constitution ${constitutionId}`, () =>
        apiFetch<any>(`${BASE_URL}/marketplace/constitutions/${constitutionId}`, {}, signal)
    );
};

/**
 * Stars or unstars a constitution in the marketplace.
 */
export const toggleConstitutionStar = (
    constitutionId: string,
    shouldStar: boolean,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`${shouldStar ? 'Star' : 'Unstar'} constitution ${constitutionId}`, () =>
        apiFetch<any>(
            `${BASE_URL}/marketplace/constitutions/${constitutionId}/star`,
            {
                method: shouldStar ? 'POST' : 'DELETE'
            },
            signal
        )
    );
};

/**
 * Downloads a constitution from the marketplace.
 */
export const downloadConstitution = (
    constitutionId: string,
    signal?: AbortSignal
): Promise<string> => {
    return logExecution(`Download constitution ${constitutionId}`, () =>
        apiFetch<string>(
            `${BASE_URL}/marketplace/constitutions/${constitutionId}/download`,
            {
                method: 'POST'
            },
            signal
        )
    );
};

// --- Thread API Functions ---

/**
 * Fetches the latest history entry (state) for a given thread.
 */
export const getLatestHistory = (threadId: string, signal?: AbortSignal): Promise<HistoryEntry> => {
	return logExecution(`Fetch latest history for thread ${threadId}`, () =>
		apiFetch<HistoryEntry>(`${BASE_URL}/threads/${threadId}/latest`, {}, signal)
	);
};


/**
 * Fetches constitutions pending review for the admin panel.
 */
export const fetchPendingReviews = (signal?: AbortSignal): Promise<any[]> => {
    return logExecution('Fetch pending constitution reviews', () =>
        apiFetch<any[]>(`${BASE_URL}/admin/reviews/pending`, {}, signal)
    );
};

/**
 * Fetches detailed information about a specific submission.
 */
export const fetchSubmissionDetails = (
    submissionId: string,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Fetch details for submission ${submissionId}`, () =>
        apiFetch<any>(`${BASE_URL}/admin/reviews/submissions/${submissionId}`, {}, signal)
    );
};

/**
 * Runs superego check on a constitution submission.
 */
export const runSuperEgoCheck = (
    submissionId: string,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Run superego check for submission ${submissionId}`, () =>
        apiFetch<any>(
            `${BASE_URL}/admin/reviews/submissions/${submissionId}/check`,
            { method: 'POST' },
            signal
        )
    );
};

/**
 * Approves a constitution submission.
 */
export const approveSubmission = (
    submissionId: string,
    reviewData: {
        comment?: string;
        tags?: string[];
        isWhitelisted?: boolean;
    },
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Approve submission ${submissionId}`, () =>
        apiFetch<any>(
            `${BASE_URL}/admin/reviews/submissions/${submissionId}/approve`,
            {
                method: 'POST',
                body: JSON.stringify(reviewData)
            },
            signal
        )
    );
};

/**
 * Rejects a constitution submission.
 */
export const rejectSubmission = (
    submissionId: string,
    reviewData: {
        comment: string;
        reason: 'inappropriate' | 'low_quality' | 'duplicate' | 'other';
    },
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Reject submission ${submissionId}`, () =>
        apiFetch<any>(
            `${BASE_URL}/admin/reviews/submissions/${submissionId}/reject`,
            {
                method: 'POST',
                body: JSON.stringify(reviewData)
            },
            signal
        )
    );
};

/**
 * Fetches relationship data for a specific constitution.
 */
export const fetchConstitutionRelationships = (
    constitutionId: string,
    signal?: AbortSignal
): Promise<any> => {
    return logExecution(`Fetch relationships for constitution ${constitutionId}`, () =>
        apiFetch<any>(
            `${BASE_URL}/constitutions/${constitutionId}/relationships`,
            {},
            signal
        )
    );
};


// Add to src/lib/api/rest.svelte.ts

/**
 * Fetches constitutions similar to the provided text.
 */
export const fetchSimilarConstitutions = (
    text: string,
    signal?: AbortSignal
): Promise<any[]> => {
    return logExecution('Fetch similar constitutions', () =>
        apiFetch<any[]>(
            `${BASE_URL}/constitutions/similar`,
            {
                method: 'POST',
                body: JSON.stringify({ text })
            },
            signal
        )
    );
};

/**
 * Fetches constitutions similar to the one with the provided ID.
 */
export const fetchSimilarConstitutionsById = (
    id: string,
    signal?: AbortSignal
): Promise<any[]> => {
    return logExecution(`Fetch similar constitutions for ID ${id}`, () =>
        apiFetch<any[]>(
            `${BASE_URL}/constitutions/${id}/similar`,
            {},
            signal
        )
    );
};

/**
 * Fetches all available tags with their counts.
 */
export const fetchTags = (
    signal?: AbortSignal
): Promise<{tag: string, count: number}[]> => {
    return logExecution('Fetch available tags', () =>
        apiFetch<{tag: string, count: number}[]>(
            `${BASE_URL}/tags`,
            {},
            signal
        )
    );
};

@router.post("/api/constitutions/similar")
async def get_similar_constitutions_endpoint(
    text: str = Body(..., embed=True)
):
    """Returns constitutions that are semantically similar to the provided text."""
    try:
        # Initialize embedding model (could be moved to startup)
        embedding_model = get_embedding_model()
        
        # Generate embedding for the input text
        query_embedding = embedding_model.embed_query(text)
        
        # Fetch all constitutions with their embeddings
        constitutions = await get_all_constitutions_with_embeddings()
        
        # Calculate similarity scores
        scored_constitutions = []
        for constitution in constitutions:
            similarity = cosine_similarity(query_embedding, constitution.embedding)
            if similarity > 0.4:  # Threshold for minimum similarity
                scored_constitutions.append({
                    "id": constitution.id,
                    "title": constitution.title,
                    "similarity": float(similarity),
                    "author": constitution.author,
                    "description": constitution.description,
                    "excerpt": get_excerpt(constitution.text, text),
                    "tags": constitution.tags,
                    "source": "marketplace",
                    "isStarred": False  # Could be determined based on user
                })
        
        # Sort by similarity (highest first)
        scored_constitutions.sort(key=lambda x: x["similarity"], reverse=True)
        
        return scored_constitutions[:10]  # Limit to top 10 matches
    except Exception as e:
        logging.error(f"Error finding similar constitutions: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to find similar constitutions.")