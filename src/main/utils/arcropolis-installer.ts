import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { FileExtractor } from './file-extractor';

/**
 * Get the latest release from a GitHub repository
 * @param {string} repo - Repository in format "owner/repo"
 * @returns {Promise<{tag: string, downloadUrl: string, version: string, name: string}>}
 */
async function getLatestGitHubRelease(repo: string): Promise<{
  tag: string;
  downloadUrl: string;
  version: string;
  name: string;
}> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repo}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'FightPlanner-Installer',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    https
      .get(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned status ${res.statusCode}`));
            return;
          }

          try {
            const release = JSON.parse(data);
            const zipAsset = release.assets.find((asset) =>
              asset.name.endsWith('.zip'),
            );

            if (!zipAsset) {
              reject(new Error('No ZIP file found in release assets'));
              return;
            }

            resolve({
              tag: release.tag_name,
              version: release.tag_name.replace('v', ''),
              downloadUrl: zipAsset.browser_download_url,
              name: zipAsset.name,
            });
          } catch (error) {
            reject(
              new Error(`Failed to parse GitHub response: ${error.message}`),
            );
          }
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Get the latest ARCropolis release from GitHub
 * @returns {Promise<{tag: string, downloadUrl: string, version: string}>}
 */
export async function getLatestArcropolisRelease() {
  return getLatestGitHubRelease('Raytwo/ARCropolis');
}

/**
 * Get the latest Skyline release from GitHub
 * @returns {Promise<{tag: string, downloadUrl: string, version: string}>}
 */
export async function getLatestSkylineRelease() {
  return getLatestGitHubRelease('skyline-dev/skyline');
}

function copyRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        cleanup(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    fs.rmdirSync(dir);
  }
}

/**
 * Download ARCropolis release ZIP
 * @param {string} downloadUrl - URL to download from
 * @param {string} targetPath - Path to save the ZIP file
 * @param {Function} progressCallback - Optional progress callback (bytesReceived, totalBytes)
 * @returns {Promise<string>} Path to downloaded file
 */
export function downloadArcropolis(
  downloadUrl: string,
  targetPath: string,
  progressCallback:
    | ((receivedBytes: number, totalBytes: number) => void)
    | null = null,
) {
  return new Promise<string>((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);

    https
      .get(
        downloadUrl,
        {
          headers: {
            'User-Agent': 'FightPlanner-ARCropolis-Installer',
          },
        },
        (res) => {
          // Handle redirects
          if (res.statusCode === 302 || res.statusCode === 301) {
            file.close();
            fs.unlinkSync(targetPath);

            return downloadArcropolis(
              res.headers.location!,
              targetPath,
              progressCallback,
            )
              .then(resolve)
              .catch(reject);
          }

          if (res.statusCode !== 200) {
            file.close();
            fs.unlinkSync(targetPath);
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;

            if (progressCallback) {
              progressCallback(receivedBytes, totalBytes);
            }
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve(targetPath);
          });
        },
      )
      .on('error', (err) => {
        file.close();
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        reject(err);
      });
  });
}

/**
 * Extract Skyline ZIP and copy exefs files to target directory
 * @param {string} zipPath - Path to Skyline ZIP file
 * @param {string} targetDir - Target directory (e.g., atmosphere/contents/01006A800016E000/)
 */
export async function extractAndInstallSkyline(
  zipPath: string,
  targetDir: string,
) {
  try {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP file does not exist: ${zipPath}`);
    }

    // Create temp extraction directory using os.tmpdir() for better compatibility
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `skyline-extract-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Extract ZIP
    try {
      await FileExtractor.extractArchive(zipPath, tempDir);
    } catch (error) {
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp directory:', cleanupError);
        }
      }
      throw new Error(`Failed to extract ZIP: ${error.message}`);
    }

    // Find exefs folder in extracted content
    const findExefsFolder = (dir, depth = 0, maxDepth = 5) => {
      if (depth > maxDepth) return null;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && entry.name.toLowerCase() === 'exefs') {
            try {
              const exefsContents = fs.readdirSync(fullPath);
              if (exefsContents.length > 0) {
                return fullPath;
              }
            } catch (e) {
              // Continue searching
            }
          }

          if (entry.isDirectory()) {
            const skipDirs = ['__macosx', '.ds_store', 'romfs'];
            if (!skipDirs.includes(entry.name.toLowerCase())) {
              const found = findExefsFolder(fullPath, depth + 1, maxDepth);
              if (found) return found;
            }
          }
        }
      } catch (error) {
        console.warn(`Error searching in ${dir}:`, error.message);
      }

      return null;
    };

    let exefsSource = findExefsFolder(tempDir);

    // Try common paths
    if (!exefsSource) {
      const commonPaths = [
        path.join(tempDir, 'exefs'),
        path.join(tempDir, 'skyline', 'exefs'),
        path.join(
          tempDir,
          'atmosphere',
          'contents',
          '01006A800016E000',
          'exefs',
        ),
      ];

      for (const commonPath of commonPaths) {
        if (fs.existsSync(commonPath)) {
          try {
            const contents = fs.readdirSync(commonPath);
            if (contents.length > 0) {
              exefsSource = commonPath;
              break;
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    if (!exefsSource) {
      throw new Error('exefs folder not found in Skyline release');
    }

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const exefsTarget = path.join(targetDir, 'exefs');

    copyRecursive(exefsSource, exefsTarget);
    cleanup(tempDir);

    return {
      success: true,
      exefsPath: exefsTarget,
    };
  } catch (error) {
    throw new Error(`Failed to extract and install Skyline: ${error.message}`);
  }
}

/**
 * Extract ARCropolis ZIP and copy romfs files to target directory
 */
export async function extractAndInstallArcropolis(
  zipPath: string,
  targetDir: string,
) {
  try {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP file does not exist: ${zipPath}`);
    }

    // Create temp extraction directory using os.tmpdir() for better compatibility
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), `arcropolis-extract-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      await FileExtractor.extractArchive(zipPath, tempDir);
    } catch (error) {
      // Cleanup on failure
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp directory:', cleanupError);
        }
      }
      throw new Error(`Failed to extract ZIP: ${error.message}`);
    }

    // Find romfs folder in extracted content - ARCropolis provides romfs
    const findRomfsFolder = (
      dir: string,
      depth = 0,
      maxDepth = 5,
    ): string | null => {
      if (depth > maxDepth) return null;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Check if this is the romfs folder
          if (entry.isDirectory() && entry.name.toLowerCase() === 'romfs') {
            // Verify it contains files (not empty)
            try {
              const romfsContents = fs.readdirSync(fullPath);
              if (romfsContents.length > 0) {
                return fullPath;
              }
            } catch (e) {
              // Continue searching
            }
          }

          // Recursively search subdirectories
          if (entry.isDirectory()) {
            // Skip common non-relevant directories
            const skipDirs = ['__macosx', '.ds_store', 'exefs'];
            if (!skipDirs.includes(entry.name.toLowerCase())) {
              const found = findRomfsFolder(fullPath, depth + 1, maxDepth);
              if (found) return found;
            }
          }
        }
      } catch (error) {
        console.warn(`Error searching in ${dir}:`, error.message);
      }

      return null;
    };

    let romfsSource = findRomfsFolder(tempDir);

    // Try common ARCropolis folder structures
    if (!romfsSource) {
      const commonPaths = [
        path.join(tempDir, 'romfs'),
        path.join(tempDir, 'ARCropolis', 'romfs'),
        path.join(
          tempDir,
          'atmosphere',
          'contents',
          '01006A800016E000',
          'romfs',
        ),
        path.join(tempDir, '01006A800016E000', 'romfs'),
      ];

      for (const commonPath of commonPaths) {
        if (fs.existsSync(commonPath)) {
          try {
            const contents = fs.readdirSync(commonPath);
            if (contents.length > 0) {
              romfsSource = commonPath;
              break;
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    if (!romfsSource) {
      // Log directory structure for debugging
      console.error('ARCropolis extraction failed - directory structure:');
      const logDirStructure = (dir: string, indent = '') => {
        try {
          const entries = fs.readdirSync(dir, {
            withFileTypes: true,
          });
          entries.forEach((entry) => {
            console.error(
              `${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`,
            );
            if (entry.isDirectory() && indent.length < 20) {
              logDirStructure(path.join(dir, entry.name), indent + '  ');
            }
          });
        } catch (e) {
          console.error(`${indent}Error reading: ${e.message}`);
        }
      };
      logDirStructure(tempDir);

      throw new Error(
        'romfs folder not found in ARCropolis release. Please check the release structure.',
      );
    }

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const romfsTarget = path.join(targetDir, 'romfs');

    copyRecursive(romfsSource, romfsTarget);
    cleanup(tempDir);

    return {
      success: true,
      romfsPath: romfsTarget,
    };
  } catch (error) {
    throw new Error(
      `Failed to extract and install ARCropolis: ${error.message}`,
    );
  }
}

/**
 * Check if ARCropolis is installed by looking for exefs (Skyline) and romfs (ARCropolis) files
 * @param {string} targetDir - Directory to check (e.g., atmosphere/contents/01006A800016E000/)
 */
export function checkArcropolisInstalled(targetDir: string) {
  try {
    const exefsPath = path.join(targetDir, 'exefs');
    const romfsPath = path.join(targetDir, 'romfs');

    // Both exefs (Skyline) and romfs (ARCropolis) should exist
    const hasExefs =
      fs.existsSync(exefsPath) && fs.readdirSync(exefsPath).length > 0;
    const hasRomfs =
      fs.existsSync(romfsPath) && fs.readdirSync(romfsPath).length > 0;

    return hasExefs && hasRomfs;
  } catch (error) {
    return false;
  }
}

/**
 * Check if arcropolis folder exists in ultimate directory
 * @param {string} ultimatePath - Path to ultimate folder (e.g., sd:/ultimate/ or yuzu/sdmc/ultimate/)
 */
export function checkArcropolisFolder(ultimatePath: string) {
  try {
    const arcropolisPath = path.join(ultimatePath, 'arcropolis');
    return (
      fs.existsSync(arcropolisPath) && fs.statSync(arcropolisPath).isDirectory()
    );
  } catch (error) {
    return false;
  }
}

/**
 * Create directory structure recursively
 * @param {string} dirPath - Directory path to create
 */
export async function createDirectory(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    throw new Error(`Failed to create directory: ${error.message}`);
  }
}
