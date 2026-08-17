import { promises as fs } from 'fs';
import * as path from 'path';

export interface TransferItem {
  localPath: string;
  itemName: string;
  kind: 'directory' | 'file';
  fileCount: number;
  totalBytes: number;
}

async function summarizeDirectory(
  dirPath: string,
): Promise<{ fileCount: number; totalBytes: number }> {
  let count = 0;
  let totalBytes = 0;

  for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
    const itemPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      const summary = await summarizeDirectory(itemPath);
      count += summary.fileCount;
      totalBytes += summary.totalBytes;
    } else if (item.isFile()) {
      count++;
      totalBytes += (await fs.stat(itemPath)).size;
    }
  }

  return { fileCount: count, totalBytes };
}

export async function collectModDirectories(
  modsPath?: string | null,
  selectedPaths?: string[],
): Promise<TransferItem[]> {
  if (!modsPath) {
    return [];
  }

  try {
    if (!(await fs.stat(modsPath)).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const normalizedSelectedPaths = selectedPaths
    ? new Set(
        selectedPaths.map((selectedPath) =>
          normalizeLocalPath(path.resolve(selectedPath)),
        ),
      )
    : null;
  const normalizedSelectedNames = selectedPaths
    ? new Set(
        selectedPaths.map((selectedPath) =>
          normalizeLocalPath(path.basename(path.resolve(selectedPath))),
        ),
      )
    : null;
  const items: TransferItem[] = [];
  for (const entry of await fs.readdir(modsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const localPath = path.join(modsPath, entry.name);
    if (
      normalizedSelectedPaths &&
      !normalizedSelectedPaths.has(
        normalizeLocalPath(path.resolve(localPath)),
      ) &&
      !normalizedSelectedNames?.has(normalizeLocalPath(entry.name))
    ) {
      continue;
    }
    const summary = await summarizeDirectory(localPath);
    items.push({
      localPath,
      itemName: entry.name,
      kind: 'directory',
      ...summary,
    });
  }

  return items;
}

function normalizeLocalPath(localPath: string): string {
  return process.platform === 'win32' ? localPath.toLowerCase() : localPath;
}

export async function collectPluginFiles(
  pluginsPath?: string | null,
): Promise<TransferItem[]> {
  if (!pluginsPath) {
    return [];
  }

  try {
    if (!(await fs.stat(pluginsPath)).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const items: TransferItem[] = [];
  for (const entry of await fs.readdir(pluginsPath, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.nro') {
      continue;
    }

    const localPath = path.join(pluginsPath, entry.name);
    const stats = await fs.stat(localPath);
    items.push({
      localPath,
      itemName: entry.name,
      kind: 'file',
      fileCount: 1,
      totalBytes: stats.size,
    });
  }

  return items;
}
