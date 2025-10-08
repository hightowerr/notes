#!/usr/bin/env node
/**
 * Patch pdf-parse to disable debug mode that runs test code at import time
 * This script should be run after npm install via postinstall hook
 */

const fs = require('fs');
const path = require('path');

const pdfParseIndexPath = path.join(
  __dirname,
  '../node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/index.js'
);

if (!fs.existsSync(pdfParseIndexPath)) {
  console.log('⚠️  pdf-parse not found at expected location - skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(pdfParseIndexPath, 'utf8');

if (content.includes('let isDebugMode = false;')) {
  console.log('✓ pdf-parse already patched');
  process.exit(0);
}

content = content.replace(
  'let isDebugMode = !module.parent;',
  'let isDebugMode = false; // Patched: was !module.parent - causing issues in ESM/dynamic import'
);

fs.writeFileSync(pdfParseIndexPath, content, 'utf8');
console.log('✓ pdf-parse patched successfully');
