/**
 * Parser Service for VS Code Extension
 * 
 * Parses package files (package.json, requirements.txt, pubspec.yaml)
 * and extracts dependency information with line number tracking.
 */

export type PackageFileType = 'package.json' | 'requirements.txt' | 'pubspec.yaml';

export interface PackageInfo {
    name: string;
    version: string;
    line: number;
    registry: 'npm' | 'pypi' | 'pub';
}

export interface ParseError {
    message: string;
    line: number;
    column: number;
}

export interface ParseResult {
    packages: PackageInfo[];
    errors: ParseError[];
}

export class ParserService {
    /**
     * Detects package file type from file name
     * @param fileName Name of the file
     * @returns Package file type or undefined if not recognized
     */
    detectFileType(fileName: string): PackageFileType | undefined {
        const lowerName = fileName.toLowerCase();

        if (lowerName.endsWith('package.json')) {
            return 'package.json';
        } else if (lowerName.endsWith('requirements.txt')) {
            return 'requirements.txt';
        } else if (lowerName.endsWith('pubspec.yaml') || lowerName.endsWith('pubspec.yml')) {
            return 'pubspec.yaml';
        }

        return undefined;
    }

    /**
     * Parses package file content
     * @param content File content
     * @param fileType Type of package file
     * @returns Parse result with packages and errors
     */
    parseFile(content: string, fileType: PackageFileType): ParseResult {
        switch (fileType) {
            case 'package.json':
                return this.parsePackageJson(content);
            case 'requirements.txt':
                return this.parseRequirementsTxt(content);
            case 'pubspec.yaml':
                return this.parsePubspecYaml(content);
            default:
                return { packages: [], errors: [] };
        }
    }

    /**
     * Parses package.json file
     */
    private parsePackageJson(content: string): ParseResult {
        const packages: PackageInfo[] = [];
        const errors: ParseError[] = [];

        try {
            const parsed = JSON.parse(content);
            const lines = content.split('\n');

            // Extract dependencies
            if (parsed.dependencies && typeof parsed.dependencies === 'object') {
                for (const [name, version] of Object.entries(parsed.dependencies)) {
                    const line = this.findLineNumber(lines, name, 'dependencies');
                    packages.push({
                        name,
                        version: String(version),
                        line,
                        registry: 'npm'
                    });
                }
            }

            // Extract devDependencies
            if (parsed.devDependencies && typeof parsed.devDependencies === 'object') {
                for (const [name, version] of Object.entries(parsed.devDependencies)) {
                    const line = this.findLineNumber(lines, name, 'devDependencies');
                    packages.push({
                        name,
                        version: String(version),
                        line,
                        registry: 'npm'
                    });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            const lineMatch = errorMessage.match(/line (\d+)/i);
            const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;

            errors.push({
                message: `Failed to parse package.json: ${errorMessage}`,
                line,
                column: 0
            });
        }

        return { packages, errors };
    }

    /**
     * Parses requirements.txt file
     */
    private parseRequirementsTxt(content: string): ParseResult {
        const packages: PackageInfo[] = [];
        const errors: ParseError[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;

            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                continue;
            }

            try {
                // Parse package line with version specifiers
                // Supports: package==1.0.0, package>=1.0.0, package~=1.0.0, etc.
                const match = line.match(/^([a-zA-Z0-9_-]+)\s*([=<>~!]+)\s*(.+)$/);

                if (match) {
                    const [, name, , version] = match;
                    packages.push({
                        name: name.trim(),
                        version: version.trim(),
                        line: lineNumber,
                        registry: 'pypi'
                    });
                } else {
                    // Try to parse package without version specifier
                    const simpleMatch = line.match(/^([a-zA-Z0-9_-]+)$/);
                    if (simpleMatch) {
                        packages.push({
                            name: simpleMatch[1].trim(),
                            version: '*',
                            line: lineNumber,
                            registry: 'pypi'
                        });
                    } else {
                        errors.push({
                            message: `Invalid package specification: ${line}`,
                            line: lineNumber,
                            column: 0
                        });
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
                errors.push({
                    message: `Failed to parse line ${lineNumber}: ${errorMessage}`,
                    line: lineNumber,
                    column: 0
                });
            }
        }

        return { packages, errors };
    }

    /**
     * Parses pubspec.yaml file
     */
    private parsePubspecYaml(content: string): ParseResult {
        const packages: PackageInfo[] = [];
        const errors: ParseError[] = [];
        const lines = content.split('\n');

        try {
            let inDependencies = false;
            let inDevDependencies = false;
            let currentIndent = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();
                const lineNumber = i + 1;

                // Skip empty lines and comments
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    continue;
                }

                // Detect dependencies section
                if (trimmedLine === 'dependencies:') {
                    inDependencies = true;
                    inDevDependencies = false;
                    currentIndent = line.indexOf('dependencies:');
                    continue;
                }

                // Detect dev_dependencies section
                if (trimmedLine === 'dev_dependencies:') {
                    inDevDependencies = true;
                    inDependencies = false;
                    currentIndent = line.indexOf('dev_dependencies:');
                    continue;
                }

                // Check if we've left the dependencies section
                if ((inDependencies || inDevDependencies) && line.length > 0 && !line.startsWith(' ')) {
                    inDependencies = false;
                    inDevDependencies = false;
                    continue;
                }

                // Parse dependency line
                if (inDependencies || inDevDependencies) {
                    const match = trimmedLine.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
                    if (match) {
                        const [, name, versionSpec] = match;
                        // Extract version from various formats: ^1.0.0, "^1.0.0", 1.0.0, etc.
                        const versionMatch = versionSpec.match(/["\']?([^"'\s]+)["\']?/);
                        const version = versionMatch ? versionMatch[1] : versionSpec.trim();

                        packages.push({
                            name: name.trim(),
                            version,
                            line: lineNumber,
                            registry: 'pub'
                        });
                    }
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            errors.push({
                message: `Failed to parse pubspec.yaml: ${errorMessage}`,
                line: 1,
                column: 0
            });
        }

        return { packages, errors };
    }

    /**
     * Finds line number of a package in JSON content
     */
    private findLineNumber(lines: string[], packageName: string, section: string): number {
        let inSection = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if we're entering the section
            if (line.includes(`"${section}"`)) {
                inSection = true;
                continue;
            }

            // If in section, look for package name
            if (inSection && line.includes(`"${packageName}"`)) {
                return i + 1; // Line numbers are 1-based
            }

            // Check if we've left the section
            if (inSection && line.trim().startsWith('}')) {
                inSection = false;
            }
        }

        return 1; // Default to line 1 if not found
    }
}
