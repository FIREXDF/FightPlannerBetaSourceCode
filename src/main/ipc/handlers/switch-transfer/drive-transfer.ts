import { promises as fs } from 'fs';
import * as path from 'path';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../../utils/error-handler';
import { resolveDrivePath } from '../../../utils/drive-detector';
import {
  SwitchTransferConfig,
  SwitchTransferProgressPayload,
} from './switch-transfer-types';

interface DriveTransferFile {
  sourcePath: string;
  destinationPath: string;
}

interface DriveTransferItem {
  itemName: string;
  files: DriveTransferFile[];
}

type ProgressCallback = (payload: SwitchTransferProgressPayload) => void;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function filesMatch(src: string, dest: string): Promise<boolean> {
  let srcStats;
  let destStats;

  try {
    [srcStats, destStats] = await Promise.all([fs.stat(src), fs.stat(dest)]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  if (
    !srcStats.isFile() ||
    !destStats.isFile() ||
    srcStats.size !== destStats.size
  ) {
    return false;
  }

  const srcFile = await fs.open(src, 'r');
  let destFile: Awaited<ReturnType<typeof fs.open>> | null = null;
  const srcBuffer = Buffer.alloc(64 * 1024);
  const destBuffer = Buffer.alloc(64 * 1024);

  try {
    destFile = await fs.open(dest, 'r');
    let position = 0;
    while (position < srcStats.size) {
      const bytesToRead = Math.min(srcBuffer.length, srcStats.size - position);
      const [srcRead, destRead] = await Promise.all([
        srcFile.read(srcBuffer, 0, bytesToRead, position),
        destFile.read(destBuffer, 0, bytesToRead, position),
      ]);

      if (
        srcRead.bytesRead !== destRead.bytesRead ||
        !srcBuffer
          .subarray(0, srcRead.bytesRead)
          .equals(destBuffer.subarray(0, destRead.bytesRead))
      ) {
        return false;
      }

      if (srcRead.bytesRead === 0) {
        return position === srcStats.size;
      }
      position += srcRead.bytesRead;
    }

    return true;
  } finally {
    await Promise.all([
      srcFile.close(),
      destFile ? destFile.close() : Promise.resolve(),
    ]);
  }
}

async function collectDirectoryFiles(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<DriveTransferFile[]> {
  const files: DriveTransferFile[] = [];
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectDirectoryFiles(sourcePath, destinationPath)));
    } else if (entry.isFile()) {
      files.push({ sourcePath, destinationPath });
    }
  }

  return files;
}

async function collectDriveTransferItems(
  config: SwitchTransferConfig,
  targetModsPath: string,
  targetPluginsPath: string,
): Promise<DriveTransferItem[]> {
  const items: DriveTransferItem[] = [];

  if (config.modsPath && (await pathExists(config.modsPath))) {
    const modEntries = await fs.readdir(config.modsPath, {
      withFileTypes: true,
    });

    for (const entry of modEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sourcePath = path.join(config.modsPath, entry.name);
      const destinationPath = path.join(targetModsPath, entry.name);
      items.push({
        itemName: entry.name,
        files: await collectDirectoryFiles(sourcePath, destinationPath),
      });
    }
  }

  if (config.pluginsPath && (await pathExists(config.pluginsPath))) {
    const pluginEntries = await fs.readdir(config.pluginsPath, {
      withFileTypes: true,
    });

    for (const entry of pluginEntries) {
      if (
        !entry.isFile() ||
        path.extname(entry.name).toLowerCase() !== '.nro'
      ) {
        continue;
      }

      items.push({
        itemName: entry.name,
        files: [
          {
            sourcePath: path.join(config.pluginsPath, entry.name),
            destinationPath: path.join(targetPluginsPath, entry.name),
          },
        ],
      });
    }
  }

  return items;
}

export async function sendModsToDrive(
  config: SwitchTransferConfig,
  onProgress: ProgressCallback,
) {
  try {
    const driveIdentifier = config.switchDriveLetter;
    if (!driveIdentifier) {
      throw new Error('Drive not specified');
    }

    const drivePath = await resolveDrivePath(driveIdentifier);
    if (!drivePath || !(await pathExists(drivePath))) {
      throw new Error(
        `Drive path ${driveIdentifier} not found or not accessible`,
      );
    }

    const targetModsPath = path.join(drivePath, 'ultimate', 'mods');
    const targetPluginsPath = path.join(
      drivePath,
      'ultimate',
      'contents',
      '01006A800016E000',
      'romfs',
      'skyline',
      'plugins',
    );

    await fs.mkdir(targetModsPath, { recursive: true });

    const transferItems = await collectDriveTransferItems(
      config,
      targetModsPath,
      targetPluginsPath,
    );
    const totalItems = transferItems.length;
    const totalFiles = transferItems.reduce(
      (total, item) => total + item.files.length,
      0,
    );
    let processedCount = 0;
    let copiedCount = 0;

    onProgress({
      status: 'copying',
      currentMod: totalItems > 0 ? 1 : 0,
      totalMods: totalItems,
      transferredCount: 0,
      copiedCount: 0,
      totalFiles,
      progress: totalFiles === 0 ? 100 : 0,
      currentModName: transferItems[0]?.itemName,
    });

    for (const [itemIndex, item] of transferItems.entries()) {
      for (const file of item.files) {
        const matches = await filesMatch(file.sourcePath, file.destinationPath);

        if (matches) {
          console.log(`Skipped existing file: ${file.destinationPath}`);
        } else {
          await fs.mkdir(path.dirname(file.destinationPath), {
            recursive: true,
          });
          await fs.copyFile(file.sourcePath, file.destinationPath);
          copiedCount++;
          console.log(`Copied file: ${file.destinationPath}`);
        }

        processedCount++;
        onProgress({
          status: 'copying',
          currentMod: itemIndex + 1,
          totalMods: totalItems,
          transferredCount: processedCount,
          copiedCount,
          totalFiles,
          progress:
            totalFiles > 0
              ? Math.min(100, Math.round((processedCount / totalFiles) * 100))
              : 100,
          currentModName: item.itemName,
          currentFileName: path.basename(file.sourcePath),
        });
      }
    }

    console.log(
      `Successfully copied ${copiedCount} files to drive ${config.switchDriveLetter}`,
    );
    return { success: true, transferredCount: copiedCount };
  } catch (error) {
    handleError(error, 'send-mods-to-drive');
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
  }
}
