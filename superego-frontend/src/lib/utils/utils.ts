// src/lib/utils/utils.ts

/**
 * Type guard to check if a value is an Error.
 * @param value Value to check
 * @returns true if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Formats an error into a user-friendly message string.
 * @param error The error object or string
 * @returns A formatted error message
 */
export function formatErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (isError(error)) {
    return error.message || 'Unknown error occurred';
  }
  return String(error) || 'Unknown error occurred';
}

/**
 * Wraps a synchronous operation function, executes it, and logs success based on its boolean return value.
 * Assumes the operation function handles its own specific logging/warnings for non-success cases.
 * @param description A description of the operation for logging.
 * @param operationFn A function that performs the operation and returns true on success, false otherwise.
 * @returns The result of the operation function
 */
export function logOperationStatus(description: string, operationFn: () => boolean): boolean {
  try {
    const success = operationFn();
    if (success) {
      console.log(`[OK] ${description}`);
    }
    return success;
  } catch (error) {
    console.error(`[FAIL] ${description}. Error:`, formatErrorMessage(error));
    return false;
  }
}

/**
 * Wraps an async function execution with standardized logging for success or failure.
 * Logs [OK] on success, [FAIL] on error, and re-throws the error.
 * @param description - A description of the action being performed (for logging).
 * @param fn - The async function to execute.
 * @returns The result of the executed function if successful, otherwise re-throws the error.
 */
export async function logExecution<T>(description: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    console.log(`[OK] ${description}`);
    return result;
  } catch (error) {
    console.error(`[FAIL] ${description}. Error:`, formatErrorMessage(error));
    throw error; // Re-throw the error so the caller can handle it if needed
  }
}

/**
 * Attempts to execute a function with retries on failure.
 * @param fn Function to execute
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Delay between retries in milliseconds
 * @param shouldRetry Optional function to determine if a particular error should trigger a retry
 * @returns Promise that resolves with the function result or rejects with the last error
 */
export async function withRetry<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 3, 
  delayMs: number = 1000,
  shouldRetry: (error: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // First attempt (attempt=0) counts as the initial try, not a retry
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if we've reached max retries or if shouldRetry returns false
      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }
      
      // Log retry attempt
      console.log(`Retrying operation, attempt ${attempt + 1} of ${maxRetries}...`);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Debounces a function to prevent rapid repeated calls.
 * @param fn Function to debounce
 * @param waitMs Time to wait in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T, 
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, waitMs);
  };
}

/**
 * Throttles a function to limit how often it can be called.
 * @param fn Function to throttle
 * @param limitMs Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T, 
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    // Store the latest args
    lastArgs = args;
    
    // If we're within the limit, schedule a call for later
    if (timeSinceLastCall < limitMs) {
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          if (lastArgs) {
            fn.apply(this, lastArgs);
          }
        }, limitMs - timeSinceLastCall);
      }
      return;
    }
    
    // We're outside the limit, call immediately
    lastCall = now;
    fn.apply(this, args);
  };
}

/**
 * Formats a number for display (e.g., 1000 -> 1K)
 * @param num Number to format
 * @returns Formatted string
 */
export function formatNumber(num: number): string {
  if (num === undefined || num === null) return '0';
  
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  
  return num.toString();
}

/**
 * Performs a basic deep clone using JSON methods.
 * Note: Loses functions, Dates become strings, etc. Use structuredClone if available and needed.
 * @param obj The object to clone.
 * @returns A deep clone of the object.
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch (e) {
      console.warn("structuredClone failed, falling back to JSON clone", e);
      // Fall through to JSON clone
    }
  }
  
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Deep clone failed:", e);
    // Fallback or throw error depending on requirements
    // For state updates, failing might be better than returning original
    throw new Error("Cloning failed: " + formatErrorMessage(e));
  }
}