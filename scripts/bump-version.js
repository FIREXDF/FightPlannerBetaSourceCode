const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const type = process.argv[2];
const custom = process.argv[3];
const dryRun = process.argv.includes('--dry-run');

const pkgPath = path.join(__dirname, '..', 'package.json');
const lockPath = path.join(__dirname, '..', 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let nextVersion = '';

if (type === 'tag' && custom) {
  nextVersion = custom.replace(/^v/, '');
  const prerelease = semver.prerelease(nextVersion);
  if (
    prerelease &&
    (!['alpha', 'beta', 'latest'].includes(String(prerelease[0])) ||
      !Number.isInteger(prerelease[1]))
  ) {
    throw new Error(
      `Invalid prerelease tag "${custom}". Use a shared channel such as ` +
        `"v4.0.1-beta.1", not "v4.0.1-beta1".`,
    );
  }
} else if (type === 'custom' && custom) {
  nextVersion = custom.replace(/^v/, '');
} else if (type === 'alpha' || type === 'beta') {
  const current = semver.parse(pkg.version);
  if (!current) {
    throw new Error(
      `package.json contains an invalid version: "${pkg.version}"`,
    );
  }

  const currentPrerelease = semver.prerelease(current);
  const currentBase = `${current.major}.${current.minor}.${current.patch}`;
  let tags = [];
  try {
    tags = execSync('git tag -l', { encoding: 'utf8' }).split(/\r?\n/);
  } catch (error) {
    console.warn(`Unable to inspect existing tags: ${error.message}`);
  }

  const escapedCurrentBase = currentBase.replace(/\./g, '\\.');
  const hasLegacyBetaReleases =
    type === 'beta' &&
    tags.some((tag) =>
      new RegExp(`^v?${escapedCurrentBase}-beta\\d+$`).test(tag),
    );
  const hasMigrationRelease = tags.some((tag) =>
    new RegExp(`^v?${escapedCurrentBase}-latest\\.\\d+$`).test(tag),
  );

  if (!currentPrerelease && hasLegacyBetaReleases && !hasMigrationRelease) {
    // Releases 4.0.0-beta5/6 forced electron-updater to the "latest" channel.
    // Publish one bridge on that channel so those installations can receive
    // this fix. The following beta run advances to 4.0.1-beta.1.
    nextVersion = `${currentBase}-latest.1`;
  } else {
    const baseVersion =
      currentPrerelease && currentPrerelease[0] === type
        ? currentBase
        : semver.inc(current, 'patch');

    if (!baseVersion) {
      throw new Error(`Unable to calculate the next ${type} version`);
    }

    let maxNum = 0;
    for (const tag of tags) {
      const match = tag.match(
        new RegExp(`^v?${baseVersion.replace(/\./g, '\\.')}-${type}\\.(\\d+)$`),
      );
      if (match) {
        maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
      }
    }

    nextVersion = `${baseVersion}-${type}.${maxNum + 1}`;
  }
} else {
  throw new Error(
    'Usage: bump-version.js <alpha|beta|custom|tag> [custom-version-or-tag]',
  );
}

if (!semver.valid(nextVersion)) {
  throw new Error(`Invalid semantic version: "${nextVersion}"`);
}

if (!dryRun) {
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = nextVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = nextVersion;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
}

console.log(nextVersion);
