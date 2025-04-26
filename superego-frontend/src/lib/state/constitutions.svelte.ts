import { nanoid } from 'nanoid';
import { fetchConstitutionHierarchy } from '$lib/api/rest.svelte';

// --- Constants ---
const LOCAL_CONSTITUTIONS_KEY = 'superego_local_constitutions';
const SUBMISSION_STATUSES_KEY = 'superego_submission_statuses';

// --- Helper Function for Sorting UI Nodes ---
function sortNodes(a: UINode, b: UINode): number {
	if (a.type === 'folder' && b.type === 'file') return -1;
	if (a.type === 'file' && b.type === 'folder') return 1;

	// Both are folders or both are files, sort alphabetically
	const titleA = a.type === 'folder' ? a.title : a.metadata.title;
	const titleB = b.type === 'folder' ? b.title : b.metadata.title;
	return titleA.localeCompare(titleB);
}

// --- Helper Functions for Transforming Global Hierarchy ---
function transformGlobalFile(file: RemoteConstitutionMetadata): UIFileNode {
	return {
		type: 'file',
		metadata: file,
		uiPath: `remote:${file.relativePath}`
	};
}

function transformGlobalFolder(folder: ConstitutionFolder): UIFolderNode {
	const children: UINode[] = [
		...folder.subFolders.map(transformGlobalFolder), // Recursive call
		...folder.constitutions.map(transformGlobalFile)
	];
	children.sort(sortNodes); // Sort children within this folder 

	// Construct a unique-ish path for the folder node itself for keying/identification if needed
	// Using the first child's path prefix or just the title might be fragile.
	// Let's use a prefix and the title. The primary use is structure, children have the real paths.
	const folderUiPath = `remote:folder:${folder.folderTitle}`; // Simple identifier

	return {
		type: 'folder',
		title: folder.folderTitle,
		uiPath: folderUiPath,
		isExpanded: false, // Default to collapsed
		children: children
	};
}


// --- Main Store Class ---

export class ConstitutionStore {
	// --- Local Constitutions State ---
	localConstitutions: LocalConstitutionMetadata[] = $state([]);

	// --- Global Constitutions State ---
	globalHierarchy: ConstitutionHierarchy | null = $state(null);
	isLoadingGlobal: boolean = $state(false);
	globalError: string | null = $state(null);
	
	// --- Submission Tracking ---
	submissionStatuses: Record<string, {
		timestamp: string;
		status: 'pending' | 'approved' | 'rejected';
		message?: string;
	}> = $state({});

	constructor() {
		// --- Load initial state from localStorage ---
		if (typeof window !== 'undefined' && window.localStorage) {
			const stored = localStorage.getItem(LOCAL_CONSTITUTIONS_KEY);
			if (stored) {
				try {
					this.localConstitutions = JSON.parse(stored);
				} catch (e) {
					console.error("Failed to parse local constitutions from localStorage", e);
					localStorage.removeItem(LOCAL_CONSTITUTIONS_KEY); // Clear invalid data
					this.localConstitutions = [];
				}
			} else {
				this.localConstitutions = [];
			}
			
			// Load submission statuses
			const storedStatuses = localStorage.getItem(SUBMISSION_STATUSES_KEY);
			if (storedStatuses) {
				try {
					this.submissionStatuses = JSON.parse(storedStatuses);
				} catch (e) {
					console.error("Failed to parse submission statuses from localStorage", e);
					localStorage.removeItem(SUBMISSION_STATUSES_KEY);
					this.submissionStatuses = {};
				}
			}
		} else {
			this.localConstitutions = [];
		}


		// --- Fetch Global Constitutions on Initialization ---
		this.#fetchGlobalData();
	}

	// --- Private Helper for Initial Fetch ---
	async #fetchGlobalData() {
		console.log('[ConstitutionStore] Initializing global constitution fetch...');
		this.isLoadingGlobal = true;
		this.globalError = null;
		try {
			const fetchedHierarchy = await fetchConstitutionHierarchy();
			this.globalHierarchy = fetchedHierarchy;
			console.log('[ConstitutionStore] Successfully fetched global constitution hierarchy.');
		} catch (err: any) {
			console.error("[ConstitutionStore] Failed to load global constitutions:", err);
			this.globalError = err.message || "Unknown error fetching global constitutions.";
		} finally {
			this.isLoadingGlobal = false;
		}
	}

	// --- Private Helper to Save Local State ---
	#saveLocalState() {
		// Check if running in a browser environment before accessing localStorage
		if (typeof window !== 'undefined' && window.localStorage) {
			localStorage.setItem(LOCAL_CONSTITUTIONS_KEY, JSON.stringify(this.localConstitutions));
			console.log('[ConstitutionStore] Saved local constitutions to localStorage.');
		}
	}
	
	// --- Private Helper to Save Submission Statuses ---
	#saveSubmissionStatuses() {
		if (typeof window !== 'undefined' && window.localStorage) {
			localStorage.setItem(SUBMISSION_STATUSES_KEY, JSON.stringify(this.submissionStatuses));
			console.log('[ConstitutionStore] Saved submission statuses to localStorage.');
		}
	}

	// --- Methods for Local State Mutation ---

	/** Adds a new local constitution with optional privacy type */
	addItem(title: string, text: string, privacyType?: string): LocalConstitutionMetadata {
		const newConstitution: LocalConstitutionMetadata = {
			localStorageKey: nanoid(),
			title: title.trim(),
			text: text,
			source: 'local',
			privacyType: privacyType as 'private' | 'unlisted' | 'public_review' || 'private'
		};
		this.localConstitutions = [...this.localConstitutions, newConstitution];
		console.log(`[ConstitutionStore] Added local constitution: ${newConstitution.localStorageKey} (${newConstitution.title}) - ${privacyType}`);
		this.#saveLocalState(); // Save after modification
		return newConstitution;
	}

	/** Updates an existing local constitution by its key with optional additional metadata */
	updateItem(key: string, title: string, text: string, privacyType?: string, shareableLink?: string): boolean {
		const index = this.localConstitutions.findIndex(c => c.localStorageKey === key);
		if (index !== -1) {
			const updatedConstitution = {
				...this.localConstitutions[index],
				title: title.trim(),
				text: text
			};
			
			// Add optional fields if provided
			if (privacyType) {
				updatedConstitution.privacyType = privacyType as 'private' | 'unlisted' | 'public_review';
			}
			
			if (shareableLink) {
				updatedConstitution.shareableLink = shareableLink;
			}
			
			const newList = [...this.localConstitutions];
			newList[index] = updatedConstitution;
			this.localConstitutions = newList;
			console.log(`[ConstitutionStore] Updated local constitution: ${key}`);
			this.#saveLocalState(); // Save after modification
			return true;
		}
		console.warn(`[ConstitutionStore] Attempted update on non-existent local constitution: ${key}`);
		return false;
	}

	/** Deletes a local constitution by its key. */
	deleteItem(key: string): boolean {
		const initialLength = this.localConstitutions.length;
		const filtered = this.localConstitutions.filter(c => c.localStorageKey !== key);
		if (filtered.length < initialLength) {
			this.localConstitutions = filtered; // Immutable update
			console.log(`[ConstitutionStore] Deleted local constitution: ${key}`);
			this.#saveLocalState(); // Save after modification
			return true;
		}
		console.warn(`[ConstitutionStore] Attempted delete on non-existent local constitution: ${key}`);
		return false;
	}
	
	/** Generates a shareable link for unlisted constitutions */
	async generateShareableLink(key: string): Promise<string> {
		// This would ideally call an API to generate a secure, shortened link
		// For now, we'll create a simple hash-based link
		const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://creeds.world';
		const shareId = btoa(`${key}-${Date.now()}`).replace(/=/g, '');
		return `${baseUrl}/constitutions/share/${shareId}`;
	}
	
	/** Track a new constitution submission */
	trackSubmission(key: string): void {
		this.submissionStatuses[key] = {
			timestamp: new Date().toISOString(),
			status: 'pending'
		};
		this.#saveSubmissionStatuses();
		console.log(`[ConstitutionStore] Tracking new submission for: ${key}`);
	}

	/** Update submission status (for future use with polling or webhook) */
	updateSubmissionStatus(key: string, status: 'pending' | 'approved' | 'rejected', message?: string): void {
		if (this.submissionStatuses[key]) {
			this.submissionStatuses[key] = {
				...this.submissionStatuses[key],
				status,
				message
			};
			this.#saveSubmissionStatuses();
			console.log(`[ConstitutionStore] Updated submission status for ${key} to ${status}`);
		} else {
			console.warn(`[ConstitutionStore] Attempted to update non-existent submission status: ${key}`);
		}
	}
	
	/** Get all submissions with their associated constitution metadata */
	getSubmissionsWithMetadata(): Array<{
		key: string;
		constitution: LocalConstitutionMetadata | null;
		status: {
			timestamp: string;
			status: 'pending' | 'approved' | 'rejected';
			message?: string;
		}
	}> {
		return Object.entries(this.submissionStatuses).map(([key, status]) => {
			const constitution = this.localConstitutions.find(c => c.localStorageKey === key) || null;
			return { key, constitution, status };
		}).filter(entry => entry.constitution !== null);
	}

	// --- Derived State for UI Tree ---

	get displayTree(): UINode[] {
		// --- Handle Loading State ---
		if (this.isLoadingGlobal) {
			return [{
				type: 'folder',
				title: 'Loading Global...', // Use title property
				uiPath: 'loading:global',
				isExpanded: true,
				children: []
			}];
		}

		// --- Handle Error State ---
		if (this.globalError) {
			return [{
				type: 'folder',
				title: `Error Loading Global: ${this.globalError}`, // Use title property
				uiPath: 'error:global',
				isExpanded: true,
				children: []
			}];
		}

		// --- Transform Local Constitutions ---
		const localFiles: UIFileNode[] = this.localConstitutions.map(meta => {
			return {
				type: 'file',
				metadata: meta,
				uiPath: `local:${meta.localStorageKey}` 
			};
		});
		localFiles.sort(sortNodes); // Sort local files alphabetically by title

		const localFolder: UIFolderNode = {
			type: 'folder',
			title: 'Local', // Use title property
			uiPath: 'local:folder', // Identifier for the local folder itself
			isExpanded: true, // Default local folder to expanded
			children: localFiles
		};

		// --- Transform Global Constitutions ---
		let globalNodes: UINode[] = [];
		if (this.globalHierarchy) {
			const globalRootFolders = this.globalHierarchy.rootFolders.map(transformGlobalFolder);
			const globalRootFiles = this.globalHierarchy.rootConstitutions.map(transformGlobalFile);
			globalNodes = [...globalRootFolders, ...globalRootFiles];
			globalNodes.sort(sortNodes); // Sort root global folders (first) and files alphabetically
		}

		// --- Combine and Return ---
		const displayTree = [localFolder, ...globalNodes];
		return displayTree;
	}
	
	/** Get all unlisted constitutions with their shareable links */
	get unlistedConstitutions(): Array<LocalConstitutionMetadata & { shareableLink: string }> {
		return this.localConstitutions
			.filter(c => c.privacyType === 'unlisted' && c.shareableLink)
			.map(c => ({ ...c })) as Array<LocalConstitutionMetadata & { shareableLink: string }>;
	}
}

// --- Export Singleton Instance ---
export const constitutionStore = new ConstitutionStore();