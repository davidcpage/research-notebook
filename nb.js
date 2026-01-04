#!/usr/bin/env node

/**
 * nb - Notebook card CLI for querying schemas and creating cards
 *
 * Usage:
 *   nb types                     # List available card types
 *   nb schema <type>             # Show schema for a card type
 *   nb create <type> <title> [section/]  # Create a new card
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Get the directory where this script lives (the notebook app root)
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));

// Commands
const COMMANDS = {
    types: listTypes,
    schema: showSchema,
    create: createCard,
    help: showHelp,
};

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showHelp();
        return;
    }

    const command = args[0];
    const handler = COMMANDS[command];

    if (!handler) {
        console.error(`Unknown command: ${command}`);
        console.error('Run "nb help" for usage');
        process.exit(1);
    }

    try {
        await handler(args.slice(1));
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
nb - Notebook card CLI

Commands:
  nb types                        List available card types
  nb schema <type>                Show schema for a card type
  nb create <type> <title> [path] Create a new card

Examples:
  nb types                        # List all card types
  nb schema note                  # Show note template schema
  nb schema code                  # Show code template schema
  nb create note "My Note"        # Create note in current directory
  nb create note "My Note" research/  # Create note in research/ section
  nb create code "Analysis" analysis/data/  # Create in subdirectory

Notes:
  - Card types are loaded from the notebook app's card-types/ directory
  - Custom types in .notebook/card-types/ are also included
  - The create command generates files with correct frontmatter format
`);
}

// Load card types from both app directory and local .notebook/card-types/
async function loadCardTypes() {
    const types = new Map();

    // Load core types from app directory
    const coreIndexPath = join(APP_DIR, 'card-types', 'index.json');
    try {
        const indexContent = await readFile(coreIndexPath, 'utf-8');
        const index = JSON.parse(indexContent);

        for (const typeName of index.modules || []) {
            const templatePath = join(APP_DIR, 'card-types', typeName, 'template.yaml');
            try {
                const templateContent = await readFile(templatePath, 'utf-8');
                const template = yaml.load(templateContent);
                types.set(typeName, { template, source: 'core', path: templatePath });
            } catch (err) {
                // Skip types with missing or invalid templates
            }
        }
    } catch (err) {
        console.error('Warning: Could not load core card types');
    }

    // Load custom types from .notebook/card-types/ (override core)
    const localTypesDir = join(process.cwd(), '.notebook', 'card-types');
    try {
        await access(localTypesDir);
        const { readdir } = await import('node:fs/promises');
        const entries = await readdir(localTypesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const typeName = entry.name;
                const templatePath = join(localTypesDir, typeName, 'template.yaml');
                try {
                    const templateContent = await readFile(templatePath, 'utf-8');
                    const template = yaml.load(templateContent);
                    types.set(typeName, { template, source: 'local', path: templatePath });
                } catch (err) {
                    // Skip types with missing or invalid templates
                }
            }
        }
    } catch (err) {
        // No local card-types directory, that's fine
    }

    return types;
}

async function listTypes(args) {
    const types = await loadCardTypes();

    if (types.size === 0) {
        console.log('No card types found');
        return;
    }

    // Check for --json flag
    if (args.includes('--json')) {
        const result = [];
        for (const [name, { template, source }] of types) {
            result.push({
                name,
                description: template.description || '',
                source,
                icon: template.ui?.icon || '',
            });
        }
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('Available card types:\n');

    // Sort by sort_order if available, then by name
    const sorted = [...types.entries()].sort((a, b) => {
        const orderA = a[1].template.ui?.sort_order ?? 999;
        const orderB = b[1].template.ui?.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a[0].localeCompare(b[0]);
    });

    for (const [name, { template, source }] of sorted) {
        const icon = template.ui?.icon || '📄';
        const desc = template.description || '';
        const sourceTag = source === 'local' ? ' (custom)' : '';
        console.log(`  ${icon} ${name}${sourceTag}`);
        if (desc) {
            console.log(`     ${desc}`);
        }
    }
}

async function showSchema(args) {
    if (args.length === 0) {
        console.error('Usage: nb schema <type>');
        console.error('Run "nb types" to see available types');
        process.exit(1);
    }

    const typeName = args[0];
    const types = await loadCardTypes();
    const typeInfo = types.get(typeName);

    if (!typeInfo) {
        console.error(`Unknown card type: ${typeName}`);
        console.error('Run "nb types" to see available types');
        process.exit(1);
    }

    const { template, source, path } = typeInfo;

    // Check for --json flag
    if (args.includes('--json')) {
        console.log(JSON.stringify(template, null, 2));
        return;
    }

    // Check for --raw flag (output full YAML)
    if (args.includes('--raw')) {
        const content = await readFile(path, 'utf-8');
        console.log(content);
        return;
    }

    // Human-readable output
    console.log(`\n${template.ui?.icon || '📄'} ${template.name || typeName}`);
    console.log(`${'─'.repeat(40)}`);
    if (template.description) {
        console.log(template.description);
    }
    console.log(`Source: ${source === 'local' ? '.notebook/card-types/' : 'core'}`);

    // Schema fields
    console.log('\nSchema fields:');
    for (const [fieldName, fieldDef] of Object.entries(template.schema || {})) {
        const required = fieldDef.required ? ' (required)' : '';
        const type = fieldDef.type || 'unknown';
        const def = fieldDef.default !== undefined ? ` [default: ${fieldDef.default}]` : '';
        console.log(`  ${fieldName}: ${type}${required}${def}`);
    }

    // File extensions
    if (template.extensions) {
        console.log('\nFile extensions:');
        for (const [ext, config] of Object.entries(template.extensions)) {
            console.log(`  ${ext} (${config.parser})`);
            if (config.bodyField) {
                console.log(`    body field: ${config.bodyField}`);
            }
            if (config.companionFiles) {
                for (const cf of config.companionFiles) {
                    console.log(`    companion: ${cf.suffix} → ${cf.field}`);
                }
            }
        }
    }

    // Example frontmatter
    console.log('\nExample frontmatter:');
    const ext = Object.keys(template.extensions || {})[0];
    const extConfig = template.extensions?.[ext];

    if (extConfig?.parser === 'yaml-frontmatter') {
        console.log('---');
        console.log(`id: ${typeName}-example`);
        console.log(`title: Example ${template.name || typeName}`);
        for (const [fieldName, fieldDef] of Object.entries(template.schema || {})) {
            if (['id', 'title', extConfig.bodyField].includes(fieldName)) continue;
            if (fieldDef.type === 'datetime') {
                console.log(`${fieldName}: ${new Date().toISOString()}`);
            } else if (fieldDef.type === 'boolean') {
                console.log(`${fieldName}: ${fieldDef.default ?? true}`);
            } else if (!['markdown', 'html', 'code', 'thumbnail'].includes(fieldDef.type)) {
                console.log(`${fieldName}: `);
            }
        }
        console.log('---');
        console.log(`\n[${extConfig.bodyField || 'content'} goes here]`);
    } else if (extConfig?.parser === 'comment-frontmatter') {
        console.log('# ---');
        console.log(`# id: ${typeName}-example`);
        console.log(`# title: Example ${template.name || typeName}`);
        for (const [fieldName, fieldDef] of Object.entries(template.schema || {})) {
            if (['id', 'title', extConfig.bodyField].includes(fieldName)) continue;
            if (fieldDef.type === 'datetime') {
                console.log(`# ${fieldName}: ${new Date().toISOString()}`);
            } else if (fieldDef.type === 'boolean') {
                console.log(`# ${fieldName}: ${fieldDef.default ?? true}`);
            } else if (!['markdown', 'html', 'code', 'thumbnail'].includes(fieldDef.type)) {
                console.log(`# ${fieldName}: `);
            }
        }
        console.log('# ---');
        console.log(`\n# [${extConfig.bodyField || 'code'} goes here]`);
    } else if (extConfig?.parser === 'json') {
        const example = { id: `${typeName}-example`, title: `Example ${template.name || typeName}` };
        for (const [fieldName, fieldDef] of Object.entries(template.schema || {})) {
            if (['id', 'title'].includes(fieldName)) continue;
            if (fieldDef.type === 'datetime') {
                example[fieldName] = new Date().toISOString();
            } else if (fieldDef.type === 'boolean') {
                example[fieldName] = fieldDef.default ?? true;
            } else if (fieldDef.type === 'url') {
                example[fieldName] = 'https://example.com';
            } else if (fieldDef.type === 'text') {
                example[fieldName] = '';
            }
        }
        console.log(JSON.stringify(example, null, 2));
    }
}

async function createCard(args) {
    if (args.length < 2) {
        console.error('Usage: nb create <type> <title> [section/path]');
        console.error('Run "nb types" to see available types');
        process.exit(1);
    }

    const typeName = args[0];
    const title = args[1];
    const targetPath = args[2] || '.';

    const types = await loadCardTypes();
    const typeInfo = types.get(typeName);

    if (!typeInfo) {
        console.error(`Unknown card type: ${typeName}`);
        console.error('Run "nb types" to see available types');
        process.exit(1);
    }

    const { template } = typeInfo;

    // Get file extension and config
    const extensions = template.extensions || {};
    const ext = Object.keys(extensions)[0];
    const extConfig = extensions[ext];

    if (!ext || !extConfig) {
        console.error(`Card type "${typeName}" has no file extension configured`);
        process.exit(1);
    }

    // Generate filename from title
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const filename = `${slug}${ext}`;

    // Generate unique ID
    const id = `${typeName}-${slug}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    // Build frontmatter
    const frontmatter = {
        id,
        title,
        created: now,
        modified: now,
    };

    // Add optional fields with defaults
    for (const [fieldName, fieldDef] of Object.entries(template.schema || {})) {
        if (['id', 'title', 'created', 'modified', extConfig.bodyField].includes(fieldName)) continue;
        if (fieldDef.default !== undefined) {
            frontmatter[fieldName] = fieldDef.default;
        }
    }

    // Generate file content
    let content;
    if (extConfig.parser === 'yaml-frontmatter') {
        const yamlFrontmatter = yaml.dump(frontmatter, { lineWidth: -1 });
        const bodyField = extConfig.bodyField || 'content';
        content = `---\n${yamlFrontmatter}---\n\n`;
    } else if (extConfig.parser === 'comment-frontmatter') {
        const lines = ['# ---'];
        for (const [key, value] of Object.entries(frontmatter)) {
            lines.push(`# ${key}: ${value}`);
        }
        lines.push('# ---');
        lines.push('');
        content = lines.join('\n') + '\n';
    } else if (extConfig.parser === 'json') {
        content = JSON.stringify(frontmatter, null, 2) + '\n';
    } else {
        console.error(`Unknown parser: ${extConfig.parser}`);
        process.exit(1);
    }

    // Ensure target directory exists
    const targetDir = join(process.cwd(), targetPath);
    await mkdir(targetDir, { recursive: true });

    // Write file
    const filePath = join(targetDir, filename);

    // Check if file already exists
    try {
        await access(filePath);
        console.error(`File already exists: ${filePath}`);
        process.exit(1);
    } catch {
        // File doesn't exist, good to proceed
    }

    await writeFile(filePath, content, 'utf-8');

    // Output result
    const relativePath = join(targetPath, filename).replace(/^\.\//, '');
    console.log(JSON.stringify({ created: relativePath, id }));
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
