import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import archiver from 'archiver';
import { app } from 'electron';
import { getProtocolHandler } from './main-protocol-setup';

import downloadsStore from './store-downloads';
import store from './store';
import ModUtils from './mod-utils';
import { FileExtractor } from './utils/file-extractor';

export interface FppModEntry {
    name: string;
    hash: string;
    source: 'embedded' | 'download';
    type?: 'mod' | 'plugin';
    downloadUrl?: string;
}

export interface FppManifest {
    // Updated FppManifest definition
    fpp_version: string;
    name: string;
    pack_version?: string;
    has_thumbnail?: boolean;
    created_at: string;
    mod_count: number;
    download_count: number;
    embedded_count: number;
    required_plugins?: string;
}

export interface FppSummary {
    manifest: FppManifest;
    mods: FppModEntry[];
    downloads: Record<string, string>;
    thumbnailPath?: string;
}

export default class FppHandler {

    static generateHash(folderName: string): string {
        return crypto.createHash('sha256').update(folderName).digest('hex').substring(0, 12);
    }

    static async createFpp(
        name: string,
        fppVersion: string,
        thumbnailPath: string | null,
        modPaths: string[],
        outputPath: string,
        mainWindow: Electron.BrowserWindow,
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        const sendProgress = (step: string, progress: number, modName?: string) => {
            mainWindow.webContents.send('fpp-create-progress', { step, progress, modName });
        };

        try {
            sendProgress('initializing', 5);
            const fppFilePath = outputPath.endsWith('.fpp') ? outputPath : `${outputPath}.fpp`;
            const output = fs.createWriteStream(fppFilePath);
            const archive = archiver('zip', { zlib: { level: 6 } });

            const downloads: Record<string, string> = {};
            const embeddedMods: { name: string; fullPath: string }[] = [];
            const dls = (downloadsStore.get('downloads') as Record<string, string>) || {};
            const pluginVersions = (store.get('pluginVersions') as Record<string, string>) || {};
            const requiredPlugins: string[] = [];

            sendProgress('preparing_manifest', 10);
            const credits: { modName: string; author: string; url: string }[] = [];

            for (const modPath of modPaths) {
                const modName = path.basename(modPath);
                const hash = FppHandler.generateHash(modName);

                const modInfo = ModUtils.readModInfo(modPath);
                if (modInfo) {
                    credits.push({
                        modName: modInfo.display_name || modName,
                        author: modInfo.authors || '',
                        url: modInfo.url || '',
                    });
                } else {
                    credits.push({ modName, author: '', url: '' });
                }

                if (modName.endsWith('.nro')) {
                    const baseName = modName.replace(/\.nro$/i, '');
                    if (pluginVersions[baseName]) {
                        requiredPlugins.push(`${baseName}:${pluginVersions[baseName]}`);
                    }
                }

                if (dls[hash]) {
                    downloads[hash] = dls[hash];
                    console.log(`[FppHandler] Mod "${modName}" has download link, adding to downloads.json`);
                } else {
                    embeddedMods.push({ name: modName, fullPath: modPath });
                    console.log(`[FppHandler] Mod "${modName}" has no download link, embedding in archive`);
                }
            }

            const manifest: FppManifest = {
                fpp_version: '2',
                pack_version: fppVersion,
                has_thumbnail: thumbnailPath ? true : false,
                name,
                created_at: new Date().toISOString(),
                mod_count: modPaths.length,
                download_count: Object.keys(downloads).length,
                embedded_count: embeddedMods.length,
                required_plugins: requiredPlugins.join(','),
            };

            const manifestXml = FppHandler.generateManifestXml(manifest);

            return new Promise((resolve, reject) => {
                output.on('close', () => {
                    console.log(`[FppHandler] FPP created: ${fppFilePath} (${archive.pointer()} bytes)`);
                    sendProgress('complete', 100);
                    resolve({ success: true, filePath: fppFilePath });
                });

                archive.on('error', (err) => {
                    console.error('[FppHandler] Archive error:', err);
                    reject({ success: false, error: err.message });
                });

                archive.pipe(output);

                archive.append(manifestXml, { name: 'manifest.xml' });

                archive.append(JSON.stringify(downloads, null, 2), { name: 'downloads.json' });

                let creditsContent = `Credits for "${name}"\n`;
                creditsContent += `${'='.repeat(40)}\n\n`;
                for (const credit of credits) {
                    creditsContent += `- ${credit.modName}`;
                    if (credit.author) creditsContent += ` by ${credit.author}`;
                    if (credit.url) creditsContent += `\n  ${credit.url}`;
                    creditsContent += '\n';
                }

                archive.append(creditsContent, { name: 'credits.txt' });

                if (thumbnailPath && fs.existsSync(thumbnailPath)) {
                    sendProgress('adding_thumbnail', 15);
                    archive.file(thumbnailPath, { name: `thumbnail${path.extname(thumbnailPath)}` });
                }

                let current = 0;
                const total = embeddedMods.length;

                for (const mod of embeddedMods) {
                    if (fs.existsSync(mod.fullPath)) {
                        const stat = fs.statSync(mod.fullPath);
                        current++;
                        const progress = 20 + Math.round((current / total) * 75);
                        sendProgress('adding_mods', progress, mod.name);

                        if (stat.isDirectory()) {
                            archive.directory(mod.fullPath, `data/mods/${mod.name}`);
                        } else if (stat.isFile() && mod.name.endsWith('.nro')) {
                            archive.file(mod.fullPath, { name: `data/plugins/${mod.name}` });
                        }
                    }
                }

                sendProgress('finalizing', 98);
                archive.finalize();
            });
        } catch (error) {
            console.error('[FppHandler] Create error:', error);
            return { success: false, error: error.message };
        }
    }

    static async readFpp(fppPath: string): Promise<FppSummary | null> {
        try {
            const tempDir = path.join(os.tmpdir(), `fpp-read-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            await FileExtractor.extractFppMetadata(fppPath, tempDir);

            const manifestPath = path.join(tempDir, 'manifest.xml');
            const downloadsPath = path.join(tempDir, 'downloads.json');

            // Look for any thumbnail file
            let thumbnailPath: string | undefined = undefined;
            const tempFiles = fs.readdirSync(tempDir);
            for (const file of tempFiles) {
                if (file.startsWith('thumbnail.')) {
                    thumbnailPath = path.join(tempDir, file);
                    break;
                }
            }

            let manifest: FppManifest = {
                fpp_version: '2',
                pack_version: '1.0.0',
                has_thumbnail: thumbnailPath ? true : false,
                name: path.basename(fppPath, '.fpp'),
                created_at: '',
                mod_count: 0,
                download_count: 0,
                embedded_count: 0,
                required_plugins: '',
            };

            if (fs.existsSync(manifestPath)) {
                manifest = FppHandler.parseManifestXml(fs.readFileSync(manifestPath, 'utf-8'));
            }

            let downloads: Record<string, string> = {};
            if (fs.existsSync(downloadsPath)) {
                downloads = JSON.parse(fs.readFileSync(downloadsPath, 'utf-8'));
            }

            const mods: FppModEntry[] = [];

            for (const [hash, url] of Object.entries(downloads)) {
                mods.push({
                    name: hash,
                    hash,
                    source: 'download',
                    type: url.includes('Plugin') ? 'plugin' : 'mod',
                    downloadUrl: url,
                });
            }

            const archiveContents = await FileExtractor.listFppContents(fppPath);
            const normalizedContents = archiveContents.map(p => p.replace(/\\/g, '/'));

            const foundMods = new Set<string>();
            const foundPlugins = new Set<string>();

            for (const file of normalizedContents) {
                if (file.startsWith('data/mods/')) {
                    const parts = file.split('/');
                    if (parts.length > 2) {
                        foundMods.add(parts[2]);
                    }
                } else if (file.startsWith('data/plugins/') && file.endsWith('.nro')) {
                    const parts = file.split('/');
                    if (parts.length > 2) {
                        foundPlugins.add(parts[2]);
                    }
                }
            }

            for (const modName of foundMods) {
                mods.push({
                    name: modName,
                    hash: FppHandler.generateHash(modName),
                    source: 'embedded',
                    type: 'mod',
                });
            }

            for (const pluginName of foundPlugins) {
                mods.push({
                    name: pluginName,
                    hash: FppHandler.generateHash(pluginName),
                    source: 'embedded',
                    type: 'plugin',
                });
            }

            manifest.mod_count = mods.length;
            manifest.download_count = Object.keys(downloads).length;
            manifest.embedded_count = mods.filter(m => m.source === 'embedded').length;

            // Delete temp extraction dir only if thumbnail is not supplied since thumbnail needs to live on for the UI
            if (!thumbnailPath) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            return { manifest, mods, downloads, thumbnailPath };
        } catch (error) {
            console.error('[FppHandler] Read error:', error);
            return null;
        }
    }

    static async installFpp(
        fppPath: string,
        mainWindow: Electron.BrowserWindow,
    ): Promise<{ success: boolean; error?: string; installedMods?: string[]; downloadedLinks?: string[] }> {
        try {
            const modsPath = store.get('modsPath') as string | null;
            if (!modsPath) {
                return { success: false, error: 'Mods folder not configured' };
            }

            const tempDir = path.join(os.tmpdir(), `fpp-install-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            const sendInstallProgress = (
                step: string,
                progress: number,
                extra: Record<string, unknown> = {},
            ) => {
                mainWindow.webContents.send('fpp-install-progress', {
                    step,
                    progress: Math.max(0, Math.min(100, Math.round(progress))),
                    ...extra,
                });
            };

            sendInstallProgress('extracting', 0);

            let lastExtractProgress = 0;
            await FileExtractor.extractArchive(fppPath, tempDir, {
                onProgress: ({ percent, file }) => {
                    const overallProgress = Math.round(percent * 0.5);
                    if (overallProgress === lastExtractProgress && percent < 100) return;

                    lastExtractProgress = overallProgress;
                    sendInstallProgress('extracting', overallProgress, {
                        extractProgress: percent,
                        file,
                    });
                },
            });

            const manifestPath = path.join(tempDir, 'manifest.xml');
            let manifest: FppManifest | null = null;
            if (fs.existsSync(manifestPath)) {
                manifest = FppHandler.parseManifestXml(fs.readFileSync(manifestPath, 'utf-8'));
                if (parseInt(manifest.fpp_version) > 2) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    return { success: false, error: 'This FPP file requires a newer version of FightPlanner' };
                }
            }

            const installedMods: string[] = [];
            const downloadedLinks: string[] = [];

            const embeddedModsDir = path.join(tempDir, 'data', 'mods');
            if (fs.existsSync(embeddedModsDir)) {
                const entries = fs.readdirSync(embeddedModsDir, { withFileTypes: true });
                const total = entries.filter(e => e.isDirectory()).length;
                let current = 0;

                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const sourcePath = path.join(embeddedModsDir, entry.name);
                        const destPath = path.join(modsPath, entry.name);

                        if (fs.existsSync(destPath)) {
                            fs.rmSync(destPath, { recursive: true, force: true });
                        }

                        FppHandler.copyDirSync(sourcePath, destPath);
                        installedMods.push(entry.name);
                        current++;

                        sendInstallProgress('installing', 50 + ((current / total) * 35), {
                            modName: entry.name,
                        });
                    }
                }
            }

            const pluginsPath = store.get('pluginsPath') as string | null;
            if (pluginsPath) {
                const embeddedPluginsDir = path.join(tempDir, 'data', 'plugins');
                if (fs.existsSync(embeddedPluginsDir)) {
                    const entries = fs.readdirSync(embeddedPluginsDir, { withFileTypes: true });
                    const plugins = entries.filter(entry => entry.isFile() && entry.name.endsWith('.nro'));
                    let current = 0;

                    for (const entry of plugins) {
                        const sourcePath = path.join(embeddedPluginsDir, entry.name);
                        const destPath = path.join(pluginsPath, entry.name);

                        fs.copyFileSync(sourcePath, destPath);
                        installedMods.push(entry.name); // Treat as an installed item
                        current++;

                        sendInstallProgress('installing', 85 + ((current / plugins.length) * 10), {
                            modName: entry.name,
                        });
                    }
                }
            }

            const downloadsPath = path.join(tempDir, 'downloads.json');
            if (fs.existsSync(downloadsPath)) {
                const downloads: Record<string, string> = JSON.parse(
                    fs.readFileSync(downloadsPath, 'utf-8'),
                );

                const links = Object.values(downloads).filter(url => url && url.length > 0);

                for (const url of links) {
                    downloadedLinks.push(url);
                }

                if (links.length > 0) {
                    sendInstallProgress('downloading', 95, {
                        totalDownloads: links.length,
                    });

                    const packName = manifest?.name || path.basename(fppPath);
                    const protocolHandler = getProtocolHandler();
                    if (protocolHandler) {
                        protocolHandler.handleFppBatchDownload(packName, links, fppPath);
                    } else {
                        console.error('[FppHandler] Protocol handler not ready for batch download.');
                    }
                }
            }

            sendInstallProgress('complete', 100);

            fs.rmSync(tempDir, { recursive: true, force: true });

            return { success: true, installedMods, downloadedLinks };
        } catch (error) {
            console.error('[FppHandler] Install error:', error);
            return { success: false, error: error.message };
        }
    }

    private static generateManifestXml(manifest: FppManifest): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<fpp>
  <fpp_version>${manifest.fpp_version}</fpp_version>
  <pack_version>${manifest.pack_version || '1.0.0'}</pack_version>
  <has_thumbnail>${manifest.has_thumbnail ? 'true' : 'false'}</has_thumbnail>
  <name>${FppHandler.escapeXml(manifest.name)}</name>
  <created_at>${manifest.created_at}</created_at>
  <mod_count>${manifest.mod_count}</mod_count>
  <download_count>${manifest.download_count}</download_count>
  <embedded_count>${manifest.embedded_count}</embedded_count>
  <required_plugins>${manifest.required_plugins || ''}</required_plugins>
</fpp>`;
    }

    private static parseManifestXml(xml: string): FppManifest {
        const getTag = (tag: string): string => {
            const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
            return match ? match[1] : '';
        };

        return {
            fpp_version: getTag('fpp_version') || '2',
            pack_version: getTag('pack_version') || '1.0.0',
            has_thumbnail: getTag('has_thumbnail') === 'true',
            name: getTag('name'),
            created_at: getTag('created_at'),
            mod_count: parseInt(getTag('mod_count')) || 0,
            download_count: parseInt(getTag('download_count')) || 0,
            embedded_count: parseInt(getTag('embedded_count')) || 0,
            required_plugins: getTag('required_plugins'),
        };
    }

    private static escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private static copyDirSync(src: string, dest: string) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                FppHandler.copyDirSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}
