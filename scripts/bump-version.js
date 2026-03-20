#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, '../package.json');
const manifestJsonPath = path.join(__dirname, '../manifest.json');

function readJson(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
}

function incrementVersion(version, type = 'patch') {
    const parts = version.split('.').map(Number);
    
    switch (type) {
        case 'major':
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
            break;
        case 'minor':
            parts[1]++;
            parts[2] = 0;
            break;
        case 'patch':
        default:
            parts[2]++;
            break;
    }
    
    return parts.join('.');
}

function archiveBuild(version) {
    const buildDir = path.join(__dirname, '../build');
    const archiveDir = path.join(__dirname, '../releases', `v${version}`);
    
    if (fs.existsSync(buildDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
        
        const files = fs.readdirSync(buildDir);
        files.forEach(file => {
            const srcPath = path.join(buildDir, file);
            const destPath = path.join(archiveDir, file);
            fs.copyFileSync(srcPath, destPath);
        });
        
        console.log(`✓ 已将构建文件归档到: ${archiveDir}`);
    }
}

function main() {
    const args = process.argv.slice(2);
    const type = args[0] || 'patch';
    const shouldArchive = args.includes('--archive');
    
    if (!['major', 'minor', 'patch'].includes(type)) {
        console.error('错误: 版本类型必须是 major, minor 或 patch');
        process.exit(1);
    }
    
    const packageJson = readJson(packageJsonPath);
    const manifestJson = readJson(manifestJsonPath);
    
    const currentVersion = packageJson.version;
    const newVersion = incrementVersion(currentVersion, type);
    
    console.log(`当前版本: ${currentVersion}`);
    console.log(`新版本: ${newVersion} (${type})`);
    
    packageJson.version = newVersion;
    manifestJson.version = newVersion;
    
    writeJson(packageJsonPath, packageJson);
    writeJson(manifestJsonPath, manifestJson);
    
    console.log('✓ 已更新 package.json');
    console.log('✓ 已更新 manifest.json');
    
    if (shouldArchive) {
        archiveBuild(newVersion);
    }
    
    console.log(`\n版本号已更新为: ${newVersion}`);
}

main();