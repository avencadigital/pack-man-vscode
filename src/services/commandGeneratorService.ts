/**
 * Command Generator Service for VS Code Extension
 * 
 * Generates package manager-specific update commands for dependencies.
 * Supports npm (package.json), pip (requirements.txt), and pub (pubspec.yaml).
 * 
 * Requirements: 19.1, 19.2, 19.3
 */

import { PackageFileType } from './parserService';

export interface UpdateCommand {
    command: string;
    description: string;
    packageManager: 'npm' | 'pip' | 'pub';
}

export class CommandGeneratorService {
    /**
     * Generates an update command for a single package
     * @param fileType Type of package file
     * @param packageName Name of the package to update
     * @param version Target version (optional, defaults to latest)
     * @returns Update command
     */
    generateUpdateCommand(
        fileType: PackageFileType,
        packageName: string,
        version?: string
    ): UpdateCommand {
        switch (fileType) {
            case 'package.json':
                return this.generateNpmUpdateCommand(packageName, version);
            case 'requirements.txt':
                return this.generatePipInstallCommand(packageName, version);
            case 'pubspec.yaml':
                return this.generatePubUpgradeCommand(packageName, version);
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    /**
     * Generates update commands for multiple packages
     * @param fileType Type of package file
     * @param packages Array of package names and versions
     * @returns Array of update commands
     */
    generateBulkUpdateCommands(
        fileType: PackageFileType,
        packages: Array<{ name: string; version?: string }>
    ): UpdateCommand[] {
        return packages.map(pkg =>
            this.generateUpdateCommand(fileType, pkg.name, pkg.version)
        );
    }

    /**
     * Generates an npm update command for package.json
     * @param packageName Name of the npm package
     * @param version Target version (optional)
     * @returns npm update command
     */
    private generateNpmUpdateCommand(packageName: string, version?: string): UpdateCommand {
        let command: string;
        let description: string;

        if (version) {
            command = `npm install ${packageName}@${version}`;
            description = `Update ${packageName} to version ${version}`;
        } else {
            command = `npm install ${packageName}@latest`;
            description = `Update ${packageName} to latest version`;
        }

        return {
            command,
            description,
            packageManager: 'npm'
        };
    }

    /**
     * Generates a pip install command for requirements.txt
     * @param packageName Name of the pip package
     * @param version Target version (optional)
     * @returns pip install command
     */
    private generatePipInstallCommand(packageName: string, version?: string): UpdateCommand {
        let command: string;
        let description: string;

        if (version) {
            command = `pip install ${packageName}==${version}`;
            description = `Install ${packageName} version ${version}`;
        } else {
            command = `pip install --upgrade ${packageName}`;
            description = `Upgrade ${packageName} to latest version`;
        }

        return {
            command,
            description,
            packageManager: 'pip'
        };
    }

    /**
     * Generates a pub upgrade command for pubspec.yaml
     * @param packageName Name of the pub package
     * @param version Target version (optional)
     * @returns pub upgrade command
     */
    private generatePubUpgradeCommand(packageName: string, version?: string): UpdateCommand {
        let command: string;
        let description: string;

        if (version) {
            // For pub, we need to manually edit pubspec.yaml for specific versions
            // But we can provide the command to upgrade after manual edit
            command = `pub upgrade ${packageName}`;
            description = `Upgrade ${packageName} (manually set version to ${version} in pubspec.yaml first)`;
        } else {
            command = `pub upgrade ${packageName}`;
            description = `Upgrade ${packageName} to latest compatible version`;
        }

        return {
            command,
            description,
            packageManager: 'pub'
        };
    }

    /**
     * Generates a command to update all dependencies
     * @param fileType Type of package file
     * @returns Update all command
     */
    generateUpdateAllCommand(fileType: PackageFileType): UpdateCommand {
        switch (fileType) {
            case 'package.json':
                return {
                    command: 'npm update',
                    description: 'Update all npm dependencies',
                    packageManager: 'npm'
                };
            case 'requirements.txt':
                return {
                    command: 'pip install --upgrade -r requirements.txt',
                    description: 'Upgrade all pip packages from requirements.txt',
                    packageManager: 'pip'
                };
            case 'pubspec.yaml':
                return {
                    command: 'pub upgrade',
                    description: 'Upgrade all pub dependencies',
                    packageManager: 'pub'
                };
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }
}
