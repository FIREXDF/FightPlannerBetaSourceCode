import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MTP_URI_PATTERN = /^mtp:\/*/i;

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeSeparators(inputPath: string) {
  return inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function getMtpUriSegments(uri: string) {
  return normalizeSeparators(uri.replace(MTP_URI_PATTERN, ''))
    .split('/')
    .map((segment) => decodePathSegment(segment.trim()))
    .filter(Boolean);
}

function pathExists(candidate: string) {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function getLinuxGvfsRoots() {
  const uid =
    typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;

  return [
    `/run/user/${uid}/gvfs`,
    `/var/run/user/${uid}/gvfs`,
    path.join(os.homedir(), '.gvfs'),
  ].filter(pathExists);
}

function findExistingMtpPath(segments: string[]) {
  if (segments.length === 0) {
    return null;
  }

  for (const gvfsRoot of getLinuxGvfsRoots()) {
    let mounts: string[] = [];

    try {
      mounts = fs
        .readdirSync(gvfsRoot)
        .filter((entry) => entry.toLowerCase().startsWith('mtp:'))
        .map((entry) => path.join(gvfsRoot, entry));
    } catch {
      continue;
    }

    for (const mountPath of mounts) {
      for (let start = 0; start < segments.length; start += 1) {
        const candidate = path.join(mountPath, ...segments.slice(start));
        if (pathExists(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

export function isMtpUri(inputPath: string | null | undefined) {
  return typeof inputPath === 'string' && MTP_URI_PATTERN.test(inputPath);
}

export function resolveVirtualPath(inputPath: string) {
  if (!isMtpUri(inputPath)) {
    return inputPath;
  }

  console.log('[VirtualPath] Resolving MTP path:', inputPath);

  if (process.platform !== 'linux') {
    console.error('[VirtualPath] MTP path rejected on unsupported platform:', {
      platform: process.platform,
      inputPath,
    });
    throw new Error(
      'MTP paths are not available as normal folders on this platform. Mount the Switch SD card as a real drive/folder first, or use FTP transfer.',
    );
  }

  const segments = getMtpUriSegments(inputPath);
  const roots = getLinuxGvfsRoots();
  console.log('[VirtualPath] Linux GVFS roots:', roots);
  console.log('[VirtualPath] MTP path segments:', segments);

  const resolvedPath = findExistingMtpPath(segments);
  if (resolvedPath) {
    console.log('[VirtualPath] MTP path resolved:', {
      inputPath,
      resolvedPath,
    });
    return resolvedPath;
  }

  console.error('[VirtualPath] Failed to resolve MTP path:', {
    inputPath,
    gvfsRoots: roots,
    segments,
  });

  throw new Error(
    `Could not resolve MTP path "${inputPath}". Open the Switch once in your file manager first, then select the mounted folder under /run/user/${process.getuid?.() ?? '<uid>'}/gvfs.`,
  );
}
