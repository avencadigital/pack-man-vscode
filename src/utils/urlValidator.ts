/**
 * URL validation utilities for Pack-Man VS Code Extension
 * 
 * Provides functions to validate API endpoint URLs for the settings configuration.
 * Ensures URLs are valid HTTP/HTTPS endpoints before saving to configuration.
 */

/**
 * Result of URL validation
 */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates an API endpoint URL
 * 
 * Checks that the input is a valid HTTP or HTTPS URL with proper protocol,
 * host, and optional path components.
 * 
 * @param input - The string to validate as an API endpoint URL
 * @returns ValidationResult with isValid flag and optional error message
 * 
 * @example
 * validateApiEndpoint("https://api.example.com") // { isValid: true }
 * validateApiEndpoint("http://localhost:3000/api") // { isValid: true }
 * validateApiEndpoint("ftp://example.com") // { isValid: false, error: "..." }
 * validateApiEndpoint("") // { isValid: false, error: "..." }
 * 
 * **Validates: Requirements 4.3, 4.4**
 */
export function validateApiEndpoint(input: string): ValidationResult {
    // Handle empty strings
    if (!input || input.length === 0) {
        return {
            isValid: false,
            error: 'API endpoint URL is required'
        };
    }

    // Handle whitespace-only strings
    const trimmed = input.trim();
    if (trimmed.length === 0) {
        return {
            isValid: false,
            error: 'API endpoint URL cannot be empty or whitespace only'
        };
    }

    // Try to parse as URL
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return {
            isValid: false,
            error: 'Invalid URL format. Please enter a valid URL (e.g., https://api.example.com)'
        };
    }

    // Validate protocol (must be http or https)
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
        return {
            isValid: false,
            error: 'URL must use HTTP or HTTPS protocol'
        };
    }

    // Validate hostname exists
    if (!url.hostname || url.hostname.length === 0) {
        return {
            isValid: false,
            error: 'URL must include a valid hostname'
        };
    }

    // All validations passed
    return { isValid: true };
}

/**
 * Checks if a string is a valid API endpoint URL
 * 
 * Convenience function that returns a boolean instead of ValidationResult.
 * 
 * @param input - The string to validate
 * @returns true if the input is a valid HTTP/HTTPS URL, false otherwise
 */
export function isValidApiEndpoint(input: string): boolean {
    return validateApiEndpoint(input).isValid;
}
