/**
 * Version comparison utilities for Pack-Man VS Code Extension
 * 
 * Provides functions to determine version change types (major, minor, patch)
 * and assess update criticality for dependency management.
 */

import * as semver from 'semver';

export type ChangeType = 'major' | 'minor' | 'patch' | 'none' | 'error';

export type UpdateSeverity = 'critical' | 'important' | 'normal' | 'none';

/**
 * Cleans version string by removing common prefixes and operators
 * @param version Version string to clean
 * @returns Cleaned version string
 */
function cleanVersion(version: string): string {
    return version
        .replace(/^[~^>=<]+/, '') // Remove version operators
        .replace(/^v/, '') // Remove 'v' prefix
        .trim();
}

/**
 * Determines the type of change between two versions
 * @param currentVersion Current version string
 * @param latestVersion Latest version string
 * @returns Type of change (major, minor, patch, none, or error)
 * 
 * @example
 * getChangeType("1.0.0", "2.0.0") // "major"
 * getChangeType("1.0.0", "1.1.0") // "minor"
 * getChangeType("1.0.0", "1.0.1") // "patch"
 * getChangeType("1.0.0", "1.0.0") // "none"
 */
export function getChangeType(
    currentVersion: string,
    latestVersion: string
): ChangeType {
    try {
        const current = semver.coerce(cleanVersion(currentVersion));
        const latest = semver.coerce(cleanVersion(latestVersion));

        if (!current || !latest) {
            return 'error';
        }

        const diff = semver.diff(current, latest);

        // If no difference, no need to update
        if (!diff) {
            return 'none';
        }

        // Normalize pre-release changes to their base type
        switch (diff) {
            case 'major':
            case 'premajor':
                return 'major';
            case 'minor':
            case 'preminor':
                return 'minor';
            case 'patch':
            case 'prepatch':
            case 'prerelease':
                return 'patch';
            default:
                return 'none';
        }
    } catch (error) {
        console.error(`Error comparing versions: ${currentVersion} vs ${latestVersion}`, error);
        return 'error';
    }
}

/**
 * Determines the severity of an update based on change type and version numbers
 * @param currentVersion Current version string
 * @param latestVersion Latest version string
 * @returns Update severity level
 * 
 * Critical: Major version updates (breaking changes)
 * Important: Minor version updates with significant version gap
 * Normal: Minor/patch updates
 * None: No update needed
 */
export function getUpdateSeverity(
    currentVersion: string,
    latestVersion: string
): UpdateSeverity {
    const changeType = getChangeType(currentVersion, latestVersion);

    if (changeType === 'none' || changeType === 'error') {
        return 'none';
    }

    // Major version changes are always critical (breaking changes)
    if (changeType === 'major') {
        return 'critical';
    }

    // Check version gap for minor updates
    if (changeType === 'minor') {
        try {
            const current = semver.coerce(cleanVersion(currentVersion));
            const latest = semver.coerce(cleanVersion(latestVersion));

            if (current && latest) {
                const minorGap = latest.minor - current.minor;

                // If minor version gap is large (>5), consider it important
                if (minorGap > 5) {
                    return 'important';
                }
            }
        } catch (error) {
            // If comparison fails, default to normal
            return 'normal';
        }
    }

    return 'normal';
}

/**
 * Gets a human-readable description of the change type
 * @param changeType Type of version change
 * @returns Human-readable description
 */
export function getChangeTypeDescription(changeType: ChangeType): string {
    switch (changeType) {
        case 'major':
            return 'Major update (breaking changes)';
        case 'minor':
            return 'Minor update (new features)';
        case 'patch':
            return 'Patch update (bug fixes)';
        case 'none':
            return 'No update needed';
        case 'error':
            return 'Unable to compare versions';
    }
}

/**
 * Gets a human-readable description of the update severity
 * @param severity Update severity level
 * @returns Human-readable description
 */
export function getSeverityDescription(severity: UpdateSeverity): string {
    switch (severity) {
        case 'critical':
            return 'Critical update - may contain breaking changes';
        case 'important':
            return 'Important update - significant version gap';
        case 'normal':
            return 'Normal update';
        case 'none':
            return 'No update needed';
    }
}

/**
 * Gets an icon for the change type
 * @param changeType Type of version change
 * @returns VS Code icon identifier
 */
export function getChangeTypeIcon(changeType: ChangeType): string {
    switch (changeType) {
        case 'major':
            return '$(alert)'; // Alert icon for breaking changes
        case 'minor':
            return '$(arrow-up)'; // Arrow up for feature updates
        case 'patch':
            return '$(wrench)'; // Wrench for bug fixes
        case 'none':
            return '$(check)'; // Check for up-to-date
        case 'error':
            return '$(error)'; // Error icon
    }
}

/**
 * Gets an icon for the update severity
 * @param severity Update severity level
 * @returns VS Code icon identifier
 */
export function getSeverityIcon(severity: UpdateSeverity): string {
    switch (severity) {
        case 'critical':
            return '$(alert)'; // Alert icon for critical updates
        case 'important':
            return '$(warning)'; // Warning icon for important updates
        case 'normal':
            return '$(info)'; // Info icon for normal updates
        case 'none':
            return '$(check)'; // Check for no update needed
    }
}

/**
 * Checks if a version should be updated based on change type and options
 * @param currentVersion Current version
 * @param latestVersion Latest version
 * @param options Update options
 * @returns Whether the version should be updated
 */
export function shouldUpdateVersion(
    currentVersion: string,
    latestVersion: string,
    options: {
        updateMajor: boolean;
        updateMinor: boolean;
        updatePatch: boolean;
    }
): boolean {
    const changeType = getChangeType(currentVersion, latestVersion);

    if (changeType === 'error' || changeType === 'none') {
        return false;
    }

    const updateMap = {
        major: options.updateMajor,
        minor: options.updateMinor,
        patch: options.updatePatch,
    };

    return updateMap[changeType] || false;
}
