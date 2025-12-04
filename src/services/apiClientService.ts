/**
 * API Client Service for VS Code Extension
 * 
 * Handles communication with Pack-Man API including retry logic,
 * timeout handling, and GitHub token authentication.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { CacheService } from './cacheService';
import { PackageInfo } from './parserService';

export interface APIAnalysisResult {
    results: Array<{
        name: string;
        currentVersion: string;
        latestVersion: string;
        status: 'up-to-date' | 'outdated' | 'error';
        registry: 'npm' | 'pypi' | 'pub';
        documentationUrl?: string;
        registryUrl?: string;
        error?: string;
    }>;
}

export class APIClientService {
    private axiosInstance: AxiosInstance;
    private cacheService: CacheService;
    private apiEndpoint: string;
    private githubToken?: string;
    private readonly timeout: number = 30000; // 30 seconds
    private readonly maxRetries: number = 3;
    private readonly successCacheTTL: number = 300000; // 5 minutes
    private readonly errorCacheTTL: number = 120000; // 2 minutes

    constructor(cacheService: CacheService, apiEndpoint: string = 'https://pack-man.tech') {
        this.cacheService = cacheService;
        this.apiEndpoint = apiEndpoint;
        this.axiosInstance = axios.create({
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Sets the API endpoint
     * @param endpoint API endpoint URL
     */
    setEndpoint(endpoint: string): void {
        this.apiEndpoint = endpoint;
    }

    /**
     * Sets the GitHub token for authentication
     * @param token GitHub token or undefined to clear
     */
    setGitHubToken(token: string | undefined): void {
        this.githubToken = token;
    }

    /**
     * Analyzes packages via API with caching and retry logic
     * @param packages Array of packages to analyze
     * @returns Analysis results
     */
    async analyzePackages(packages: PackageInfo[]): Promise<APIAnalysisResult> {
        // Generate cache key based on packages
        const cacheKey = this.generateCacheKey(packages);

        // Check cache first
        const cachedResult = this.cacheService.get<APIAnalysisResult>(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        // Make API request with retry logic
        try {
            const result = await this.makeRequestWithRetry(packages);

            // Cache successful result
            this.cacheService.set(cacheKey, result, this.successCacheTTL);

            return result;
        } catch (error) {
            // Create error result
            const errorResult = this.createErrorResult(packages, error);

            // Cache error result with shorter TTL
            this.cacheService.set(cacheKey, errorResult, this.errorCacheTTL);

            return errorResult;
        }
    }

    /**
     * Makes API request with exponential backoff retry logic
     */
    private async makeRequestWithRetry(packages: PackageInfo[]): Promise<APIAnalysisResult> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await this.makeRequest(packages);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');

                // Don't retry on client errors (4xx)
                if (axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
                    throw error;
                }

                // Calculate exponential backoff delay
                if (attempt < this.maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Request failed after retries');
    }

    /**
     * Makes the actual API request
     * @param packages Array of packages with file content
     */
    private async makeRequest(packages: PackageInfo[]): Promise<APIAnalysisResult> {
        const url = `${this.apiEndpoint}/api/analyze-packages`;

        // Prepare request headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // Add GitHub token if available (for future use with private repos)
        if (this.githubToken) {
            headers['Authorization'] = `Bearer ${this.githubToken}`;
        }

        // Reconstruct file content from packages
        // The API expects { content, fileName } format
        const fileContent = this.reconstructFileContent(packages);
        const fileName = this.getFileNameFromRegistry(packages[0]?.registry);

        const requestBody = {
            content: fileContent,
            fileName: fileName
        };

        const response = await this.axiosInstance.post(
            url,
            requestBody,
            { headers }
        );

        // Map API response to extension format
        return this.mapApiResponse(response.data, packages);
    }

    /**
     * Reconstructs file content from parsed packages
     */
    private reconstructFileContent(packages: PackageInfo[]): string {
        if (packages.length === 0) {
            return '';
        }

        const registry = packages[0].registry;

        switch (registry) {
            case 'npm':
                return this.reconstructPackageJson(packages);
            case 'pypi':
                return this.reconstructRequirementsTxt(packages);
            case 'pub':
                return this.reconstructPubspecYaml(packages);
            default:
                return '';
        }
    }

    /**
     * Reconstructs package.json content
     */
    private reconstructPackageJson(packages: PackageInfo[]): string {
        const dependencies: Record<string, string> = {};

        for (const pkg of packages) {
            dependencies[pkg.name] = pkg.version;
        }

        return JSON.stringify({
            dependencies
        }, null, 2);
    }

    /**
     * Reconstructs requirements.txt content
     */
    private reconstructRequirementsTxt(packages: PackageInfo[]): string {
        return packages.map(pkg => {
            // Handle different version specifiers
            if (pkg.version === '*' || pkg.version === 'latest') {
                return pkg.name;
            }
            // If version already has operator, use as is
            if (/^[=<>~!]/.test(pkg.version)) {
                return `${pkg.name}${pkg.version}`;
            }
            // Default to == operator
            return `${pkg.name}==${pkg.version}`;
        }).join('\n');
    }

    /**
     * Reconstructs pubspec.yaml content
     */
    private reconstructPubspecYaml(packages: PackageInfo[]): string {
        const lines = ['dependencies:'];

        for (const pkg of packages) {
            lines.push(`  ${pkg.name}: ${pkg.version}`);
        }

        return lines.join('\n');
    }

    /**
     * Gets filename from registry type
     */
    private getFileNameFromRegistry(registry: 'npm' | 'pypi' | 'pub' | undefined): string {
        switch (registry) {
            case 'npm':
                return 'package.json';
            case 'pypi':
                return 'requirements.txt';
            case 'pub':
                return 'pubspec.yaml';
            default:
                return 'package.json';
        }
    }

    /**
     * Maps API response to extension format
     */
    private mapApiResponse(apiData: any, originalPackages: PackageInfo[]): APIAnalysisResult {
        const results = apiData.packages.map((pkg: any) => ({
            name: pkg.name,
            currentVersion: pkg.currentVersion,
            latestVersion: pkg.latestVersion,
            status: pkg.status,
            registry: pkg.packageManager === 'pip' ? 'pypi' : pkg.packageManager,
            documentationUrl: pkg.homepage,
            registryUrl: this.getRegistryUrl(pkg.name, pkg.packageManager),
            error: pkg.error
        }));

        return { results };
    }

    /**
     * Gets registry URL for a package
     */
    private getRegistryUrl(name: string, packageManager: string): string {
        switch (packageManager) {
            case 'npm':
                return `https://www.npmjs.com/package/${name}`;
            case 'pip':
                return `https://pypi.org/project/${name}`;
            case 'pub':
                return `https://pub.dev/packages/${name}`;
            default:
                return '';
        }
    }

    /**
     * Creates an error result for failed API requests
     */
    private createErrorResult(packages: PackageInfo[], error: unknown): APIAnalysisResult {
        const errorMessage = this.getErrorMessage(error);

        return {
            results: packages.map(pkg => ({
                name: pkg.name,
                currentVersion: pkg.version,
                latestVersion: pkg.version,
                status: 'error' as const,
                registry: pkg.registry,
                error: errorMessage
            }))
        };
    }

    /**
     * Extracts user-friendly error message from error object
     * Also returns error type for specialized handling
     */
    private getErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            // Handle specific network error codes
            if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
                return 'Request timeout. Please check your network connection.';
            }

            if (axiosError.code === 'ENOTFOUND') {
                return 'Unable to reach API endpoint. The hostname could not be resolved. Please check your API endpoint configuration and network connection.';
            }

            if (axiosError.code === 'ECONNREFUSED') {
                return 'Unable to reach API endpoint. Connection refused. Please verify the API endpoint is running and accessible.';
            }

            if (axiosError.code === 'ENETUNREACH' || axiosError.code === 'EHOSTUNREACH') {
                return 'Unable to reach API endpoint. Network is unreachable. Please check your internet connection.';
            }

            if (axiosError.code === 'EAI_AGAIN') {
                return 'Unable to reach API endpoint. DNS lookup failed. Please check your network connection and try again.';
            }

            if (axiosError.response) {
                const status = axiosError.response.status;

                if (status === 401 || status === 403) {
                    return 'Authentication failed. Please check your GitHub token.';
                }

                if (status === 429) {
                    return 'Rate limit exceeded. Consider configuring a GitHub token.';
                }

                if (status >= 500) {
                    return 'Server error. Please try again later.';
                }

                return `API error: ${status}`;
            }

            if (axiosError.request) {
                return 'Unable to reach API endpoint. Please check your network connection and API endpoint configuration.';
            }
        }

        if (error instanceof Error) {
            return error.message;
        }

        return 'Unknown error occurred';
    }

    /**
     * Gets the error type for specialized handling
     */
    getErrorType(error: unknown): 'auth' | 'rate-limit' | 'network' | 'server' | 'unknown' {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            // Check for network error codes first
            const networkErrorCodes = [
                'ECONNABORTED',
                'ETIMEDOUT',
                'ENOTFOUND',
                'ECONNREFUSED',
                'ENETUNREACH',
                'EHOSTUNREACH',
                'EAI_AGAIN'
            ];

            if (axiosError.code && networkErrorCodes.includes(axiosError.code)) {
                return 'network';
            }

            if (axiosError.response) {
                const status = axiosError.response.status;

                if (status === 401 || status === 403) {
                    return 'auth';
                }

                if (status === 429) {
                    return 'rate-limit';
                }

                if (status >= 500) {
                    return 'server';
                }
            }

            // If there's a request but no response, it's likely a network error
            if (axiosError.request) {
                return 'network';
            }
        }

        return 'unknown';
    }

    /**
     * Generates cache key from packages
     */
    private generateCacheKey(packages: PackageInfo[]): string {
        const packageStrings = packages
            .map(pkg => `${pkg.registry}:${pkg.name}@${pkg.version}`)
            .sort()
            .join('|');

        return `api:${packageStrings}`;
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
