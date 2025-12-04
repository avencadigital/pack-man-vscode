/**
 * Tests for Command Generator Service
 */

import { describe, it, expect } from 'vitest';
import { CommandGeneratorService } from './commandGeneratorService';

describe('CommandGeneratorService', () => {
    const service = new CommandGeneratorService();

    describe('generateUpdateCommand', () => {
        it('should generate npm update command for package.json', () => {
            const command = service.generateUpdateCommand('package.json', 'react', '18.0.0');

            expect(command.command).toBe('npm install react@18.0.0');
            expect(command.description).toContain('react');
            expect(command.description).toContain('18.0.0');
            expect(command.packageManager).toBe('npm');
        });

        it('should generate npm update command without version', () => {
            const command = service.generateUpdateCommand('package.json', 'react');

            expect(command.command).toBe('npm install react@latest');
            expect(command.description).toContain('latest');
            expect(command.packageManager).toBe('npm');
        });

        it('should generate pip install command for requirements.txt', () => {
            const command = service.generateUpdateCommand('requirements.txt', 'django', '4.2.0');

            expect(command.command).toBe('pip install django==4.2.0');
            expect(command.description).toContain('django');
            expect(command.description).toContain('4.2.0');
            expect(command.packageManager).toBe('pip');
        });

        it('should generate pip upgrade command without version', () => {
            const command = service.generateUpdateCommand('requirements.txt', 'django');

            expect(command.command).toBe('pip install --upgrade django');
            expect(command.description).toContain('latest');
            expect(command.packageManager).toBe('pip');
        });

        it('should generate pub upgrade command for pubspec.yaml', () => {
            const command = service.generateUpdateCommand('pubspec.yaml', 'flutter', '3.0.0');

            expect(command.command).toBe('pub upgrade flutter');
            expect(command.description).toContain('flutter');
            expect(command.description).toContain('3.0.0');
            expect(command.packageManager).toBe('pub');
        });

        it('should generate pub upgrade command without version', () => {
            const command = service.generateUpdateCommand('pubspec.yaml', 'flutter');

            expect(command.command).toBe('pub upgrade flutter');
            expect(command.description).toContain('latest compatible');
            expect(command.packageManager).toBe('pub');
        });
    });

    describe('generateBulkUpdateCommands', () => {
        it('should generate multiple npm update commands', () => {
            const packages = [
                { name: 'react', version: '18.0.0' },
                { name: 'vue', version: '3.0.0' }
            ];

            const commands = service.generateBulkUpdateCommands('package.json', packages);

            expect(commands).toHaveLength(2);
            expect(commands[0].command).toBe('npm install react@18.0.0');
            expect(commands[1].command).toBe('npm install vue@3.0.0');
        });

        it('should generate multiple pip install commands', () => {
            const packages = [
                { name: 'django', version: '4.2.0' },
                { name: 'flask' }
            ];

            const commands = service.generateBulkUpdateCommands('requirements.txt', packages);

            expect(commands).toHaveLength(2);
            expect(commands[0].command).toBe('pip install django==4.2.0');
            expect(commands[1].command).toBe('pip install --upgrade flask');
        });
    });

    describe('generateUpdateAllCommand', () => {
        it('should generate npm update all command', () => {
            const command = service.generateUpdateAllCommand('package.json');

            expect(command.command).toBe('npm update');
            expect(command.description).toContain('all npm dependencies');
            expect(command.packageManager).toBe('npm');
        });

        it('should generate pip upgrade all command', () => {
            const command = service.generateUpdateAllCommand('requirements.txt');

            expect(command.command).toBe('pip install --upgrade -r requirements.txt');
            expect(command.description).toContain('all pip packages');
            expect(command.packageManager).toBe('pip');
        });

        it('should generate pub upgrade all command', () => {
            const command = service.generateUpdateAllCommand('pubspec.yaml');

            expect(command.command).toBe('pub upgrade');
            expect(command.description).toContain('all pub dependencies');
            expect(command.packageManager).toBe('pub');
        });
    });
});
