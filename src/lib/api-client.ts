// API Client with environment-aware configuration and retry logic

const getBackendUrl = (): string => {
  // Check if VITE_BACKEND_API_URL is set in environment
  const envUrl = import.meta.env.VITE_BACKEND_API_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // In production, use relative path (assumes frontend and backend on same domain)
  if (import.meta.env.PROD) {
    return '/api';
  }
  
  // Default to localhost for development
  return 'http://localhost:8000';
};

export const BACKEND_URL = getBackendUrl();

interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

const defaultRetryConfig: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  timeout: 120000, // 120 seconds (increased for slow Ollama responses on CPU)
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with retry logic and timeout
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = {}
): Promise<Response> {
  const { maxRetries, retryDelay, timeout } = { ...defaultRetryConfig, ...config };
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If response is ok or client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      // Server error (5xx) - retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's an abort error (timeout)
        if (error.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${timeout}ms`);
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          lastError = new Error('Network error: Unable to connect to backend');
        } else {
          lastError = error;
        }
      } else {
        lastError = new Error('Unknown error occurred');
      }
    }
    
    // Don't sleep on last attempt
    if (attempt < maxRetries - 1) {
      await sleep(retryDelay * (attempt + 1)); // Exponential backoff
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

/**
 * API client for backend communication
 */
export const apiClient = {
  /**
   * Send a chat message
   */
  async chat(message: string, conversationHistory: Array<{ role: string; content: string }> = [], includeContext = true) {
    const response = await fetchWithRetry(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
        include_context: includeContext,
      }),
    }, {
      timeout: 120000, // 120 seconds for Ollama responses
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat request failed: ${error}`);
    }
    
    return response.json();
  },
  
  /**
   * Get cluster health
   */
  async getClusterHealth() {
    const response = await fetchWithRetry(
      `${BACKEND_URL}/api/openshift/cluster-health`,
      {},
      { timeout: 60000 } // 60 second timeout for cluster health
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch cluster health: ${error}`);
    }
    
    return response.json();
  },
  
  /**
   * Check backend health
   */
  async checkHealth() {
    try {
      const response = await fetchWithRetry(`${BACKEND_URL}/health`, {}, { maxRetries: 1, timeout: 5000 });
      return response.ok;
    } catch {
      return false;
    }
  },
};

// Made with Bob