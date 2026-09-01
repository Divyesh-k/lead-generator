const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify } = require('terser');

// Files to minify and obfuscate
const filesToProcess = [
    'background.js',
    'main.js',
    'popup.js',
    'public/js/api.js',
    'public/js/auth.js',
    'public/js/dashboard.js'
];

// Output directory
const outputDir = 'dist';

// Obfuscation options for maximum protection
const obfuscationOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false, // Set to true for extra protection (may cause issues)
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

async function processFile(filePath) {
    try {
        const fullPath = path.join(__dirname, filePath);
        const code = fs.readFileSync(fullPath, 'utf8');

        console.log(`Processing: ${filePath}`);

        // First minify with Terser
        const minified = await minify(code, {
            compress: {
                dead_code: true,
                drop_console: false, // Set to true to remove console.log
                drop_debugger: true,
                keep_classnames: false,
                keep_fnames: false,
                passes: 2
            },
            mangle: {
                toplevel: true,
                eval: true,
                keep_classnames: false,
                keep_fnames: false
            },
            output: {
                comments: false,
                beautify: false
            }
        });

        // Then obfuscate
        const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, obfuscationOptions);

        // Create output path
        const outputPath = path.join(__dirname, outputDir, filePath);
        const outputDirPath = path.dirname(outputPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
        }

        // Write obfuscated code
        fs.writeFileSync(outputPath, obfuscated.getObfuscatedCode(), 'utf8');

        console.log(`✓ Completed: ${filePath}`);

        // Show size comparison
        const originalSize = Buffer.byteLength(code, 'utf8');
        const obfuscatedSize = Buffer.byteLength(obfuscated.getObfuscatedCode(), 'utf8');
        console.log(`  Original: ${originalSize} bytes → Obfuscated: ${obfuscatedSize} bytes`);

    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

async function copyOtherFiles() {
    // Copy HTML, CSS, JSON, and image files
    const filesToCopy = [
        'manifest.json',
        'popup.html',
        'popup.css',
        'styles.css',
        'options.html',
        'icon16.png',
        'icon16.jpg',
        'download.png',
        'download.jpg'
    ];

    for (const file of filesToCopy) {
        try {
            const sourcePath = path.join(__dirname, file);
            const destPath = path.join(__dirname, outputDir, file);

            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`✓ Copied: ${file}`);
            }
        } catch (error) {
            console.error(`Error copying ${file}:`, error.message);
        }
    }

    // Copy public directory HTML files
    const publicDir = path.join(__dirname, 'public');
    const publicDistDir = path.join(__dirname, outputDir, 'public');

    if (fs.existsSync(publicDir)) {
        if (!fs.existsSync(publicDistDir)) {
            fs.mkdirSync(publicDistDir, { recursive: true });
        }

        const publicFiles = fs.readdirSync(publicDir);
        for (const file of publicFiles) {
            if (file.endsWith('.html') || file.endsWith('.css')) {
                const sourcePath = path.join(publicDir, file);
                const destPath = path.join(publicDistDir, file);
                fs.copyFileSync(sourcePath, destPath);
                console.log(`✓ Copied: public/${file}`);
            }
        }
    }
}

async function build() {
    console.log('🚀 Starting build process...\n');

    // Create dist directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Process all JavaScript files
    for (const file of filesToProcess) {
        await processFile(file);
    }

    // Copy non-JS files
    console.log('\n📋 Copying other files...');
    await copyOtherFiles();

    console.log('\n✅ Build complete! Minified extension is in the "dist" folder.');
    console.log('⚠️  Note: The server folder was not minified. If you need to protect server code too, let me know!');
}

build().catch(console.error);
