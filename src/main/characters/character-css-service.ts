import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { XMLParser } from 'fast-xml-parser';

import { ConfigGenerator } from '../mod-utils/config-generator';
import { ModScanner } from '../mod-utils/mod-scanner';
import { SlotChanger } from '../mod-utils/slot-changer';

import store from '../store';

const PERSISTED_CHARA_JSON_FILE = 'ui_chara_css_layout.json';
const PERSISTED_LAYOUT_JSON_FILE = 'ui_layout_css_layout.json';
const PERSISTED_MSG_NAME_JSON_FILE = 'msg_name_css_layout.json';
const PERSISTED_MSG_NAME_FILE = 'msg_name_css_layout.msbt';
const PERSISTED_SOURCE_MANIFEST_FILE = 'character-css-source.json';
const TEMP_CHARA_JSON_FILE = 'ui_chara_db.json';
const TEMP_LAYOUT_JSON_FILE = 'ui_layout_db.json';
const TEMP_CHARA_XML_FILE = 'ui_chara_db.xml';
const TEMP_LAYOUT_XML_FILE = 'ui_layout_db.xml';
const TEMP_MSG_NAME_JSON_FILE = 'msg_name.json';
const SOURCE_CHARA_PRC_FILE = 'ui_chara_db.prc';
const SOURCE_LAYOUT_PRC_FILE = 'ui_layout_db.prc';
const GENERATED_MSG_NAME_FILE = 'msg_name.msbt';
const MIN_PARAM_XML_SBYTE = -128;
const MAX_PARAM_XML_SBYTE = 127;
let paramLabelMapCache: Map<string, string> | null = null;

const PARAM_XML_TAG_BY_COLLECTION: Record<string, string> = {
  hash40: 'hash40',
  string: 'string',
  short: 'short',
  int: 'int',
  sbyte: 'sbyte',
  bool: 'bool',
  byte: 'byte',
  float: 'float',
};

const CSS_MANAGER_FIELD_INDEX: Record<string, Record<string, number>> = {
  hash40: {
    ui_chara_id: 0,
    fighter_kind: 1,
    fighter_kind_corps: 2,
    ui_series_id: 3,
    fighter_type: 4,
    alt_chara_id: 5,
  },
  sbyte: {
    skill_list_order: 1,
    disp_order: 2,
  },
  bool: {
    can_select: 3,
    is_mii: 6,
    is_boss: 7,
    is_hidden_boss: 8,
    is_dlc: 9,
    is_patch: 10,
  },
  byte: {
    color_num: 0,
    c00_index: 1,
    c01_index: 2,
    c02_index: 3,
    c03_index: 4,
    c04_index: 5,
    c05_index: 6,
    c06_index: 7,
    c07_index: 8,
    n00_index: 9,
    n01_index: 10,
    n02_index: 11,
    n03_index: 12,
    n04_index: 13,
    n05_index: 14,
    n06_index: 15,
    n07_index: 16,
  },
};

const CSS_MANAGER_LAYOUT_FIELD_INDEX: Record<string, Record<string, number>> = {
  hash40: {
    ui_layout_id: 0,
    ui_chara_id: 1,
  },
  byte: {
    chara_color: 0,
  },
};

export interface CharacterCssEntry {
  id: string;
  nameId: string;
  displayName: string;
  number: string;
  imageUrl: string | null;
  order: number;
  hidden: boolean;
  canSelect: boolean;
  isRandom: boolean;
  uiSeriesId: string;
  fighterKind: string;
  fighterKindCorps: string;
  altCharaId: string;
  fighterType: string;
  exhibitYear: string;
  colorNum: string;
  colorStartIndex: string;
  isMii: boolean;
  isBoss: boolean;
  isHiddenBoss: boolean;
  isGroup: boolean;
  groupId: string | null;
  slots: CharacterCssSlot[];
}

export interface CharacterCssSlot {
  slotIndex: number;
  cxxIndex: string;
  nxxIndex: string;
  characallLabel: string;
  namChr0: string;
  namChr1: string;
  namChr2: string;
  namChr3: string;
  namStageName: string;
}

export interface CharacterCssLayoutData {
  source: 'saved' | 'canonical';
  visibleCharacters: CharacterCssEntry[];
  hiddenCharacters: CharacterCssEntry[];
  groups: Record<string, CharacterCssEntry[]>;
}

export interface CharacterCssLayoutPayload {
  visibleCharacterIds: string[];
  hiddenCharacterIds: string[];
  groups?: Record<string, string[]>;
  createdGroups?: CharacterCssGroupCreate[];
  renamedCharacters?: Record<string, string>;
  characterUpdates?: Record<string, CharacterCssUpdate>;
}

export interface CharacterCssGroupCreate {
  id: string;
  nameId: string;
  displayName: string;
}

export interface CharacterCssSourceImportPayload {
  prcPath: string;
  layoutPrcPath: string;
  msgNamePath: string;
}

export interface DuplicateCharacterCssPayload {
  sourceCharacterId: string;
  newUiCharaId: string;
  newNameId?: string | null;
  newDisplayName?: string | null;
}

export interface RemoveCharacterCssPayload {
  characterId: string;
}

export interface RemoveEchoSlotPayload {
  characterId: string;
  modPath?: string;
}

export interface CreateEchoSlotPayload {
  sourceCharacterId: string;
  newNameId: string;
  newDisplayName: string;
  colorCount: number;
  colorStartIndex: number;
  useTwoBaseModels?: boolean;
  modPath: string;
}

export interface CharacterCssUpdate {
  uiCharaId?: string;
  uiSeriesId?: string;
  nameId?: string;
  fighterKind?: string;
  fighterKindCorps?: string;
  altCharaId?: string;
  fighterType?: string;
  exhibitYear?: string;
  colorNum?: string;
  colorStartIndex?: string;
  canSelect?: boolean;
  isMii?: boolean;
  isBoss?: boolean;
  isHiddenBoss?: boolean;
  slots?: Record<string, Partial<CharacterCssSlot>>;
}

interface ToolExecutionResult {
  stdout: string;
  stderr: string;
}

function logCharacterCss(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log('[CharacterCSS]', message, details);
    return;
  }

  console.log('[CharacterCSS]', message);
}

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getPersistedDataDir() {
  const dirPath = path.join(app.getPath('userData'), 'data');
  ensureDirectory(dirPath);
  return dirPath;
}

function getPersistedCharaJsonPath() {
  return path.join(getPersistedDataDir(), PERSISTED_CHARA_JSON_FILE);
}

function getPersistedLayoutJsonPath() {
  return path.join(getPersistedDataDir(), PERSISTED_LAYOUT_JSON_FILE);
}

function getPersistedMsgNameJsonPath() {
  return path.join(getPersistedDataDir(), PERSISTED_MSG_NAME_JSON_FILE);
}

function getPersistedMsgNamePath() {
  return path.join(getPersistedDataDir(), PERSISTED_MSG_NAME_FILE);
}

function getPersistedSourceManifestPath() {
  return path.join(getPersistedDataDir(), PERSISTED_SOURCE_MANIFEST_FILE);
}

function hasImportedCharacterCssSource() {
  return (
    fs.existsSync(getPersistedSourceManifestPath()) &&
    fs.existsSync(getPersistedCharaJsonPath()) &&
    fs.existsSync(getPersistedLayoutJsonPath()) &&
    fs.existsSync(getPersistedMsgNameJsonPath()) &&
    fs.existsSync(getPersistedMsgNamePath())
  );
}

function requireImportedCharacterCssSource() {
  if (hasImportedCharacterCssSource()) {
    return;
  }

  throw new Error(
    'Character CSS editor requires your ui_chara_db.prc, ui_layout_db.prc and msg_name.msbt first. Import them from Edit CSS.',
  );
}

function getTempCssDir() {
  const dirPath = path.join(app.getPath('temp'), 'fightplanner-character-css');
  ensureDirectory(dirPath);
  return dirPath;
}

function getToolCandidates() {
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath;

  return [
    path.join(appPath, 'tools'),
    path.join(resourcesPath, 'tools'),
    path.join(path.dirname(appPath), 'tools'),
  ];
}

function resolveToolsPath(...segments: string[]) {
  for (const candidate of getToolCandidates()) {
    const resolved = path.join(candidate, ...segments);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return path.join(app.getAppPath(), 'tools', ...segments);
}

function prepareExecutableTool(executablePath: string) {
  if (process.platform === 'win32') {
    return executablePath;
  }

  const isAppImageMount =
    Boolean(process.env.APPIMAGE) ||
    executablePath.includes(`${path.sep}.mount_`);

  if (!isAppImageMount) {
    try {
      fs.accessSync(executablePath, fs.constants.X_OK);
      return executablePath;
    } catch {
      // Packaged resources can be read-only and lose executable permissions.
    }
  }

  const sourceDirectory = path.dirname(executablePath);
  const cacheDirectory = path.join(
    app.getPath('temp'),
    'fightplanner-tools',
    app.getVersion(),
    path.basename(sourceDirectory),
  );
  const preparedPath = path.join(
    cacheDirectory,
    path.basename(executablePath),
  );

  if (!fs.existsSync(preparedPath)) {
    fs.cpSync(sourceDirectory, cacheDirectory, {
      recursive: true,
      force: true,
    });
  }

  fs.chmodSync(preparedPath, 0o755);
  return preparedPath;
}

function prepareMsbtEditorExecutable(
  executablePath: string,
  patchedAssemblyPath: string,
) {
  const sourceDirectory = path.dirname(executablePath);
  const cacheDirectory = path.join(
    app.getPath('temp'),
    'fightplanner-tools',
    app.getVersion(),
    path.basename(sourceDirectory),
  );
  const preparedPath = path.join(cacheDirectory, path.basename(executablePath));

  if (!fs.existsSync(preparedPath)) {
    fs.cpSync(sourceDirectory, cacheDirectory, {
      recursive: true,
      force: true,
    });
  }

  // The self-contained app hosts carry the runtime, while this assembly also
  // understands FightPlanner's added_labels extension used by Echo fighters.
  fs.copyFileSync(
    patchedAssemblyPath,
    path.join(cacheDirectory, 'MSBTEditorCli.dll'),
  );
  if (process.platform !== 'win32') {
    fs.chmodSync(preparedPath, 0o755);
  }

  return preparedPath;
}

function resolveParamLabelsPath(): string | null {
  const candidates = [
    resolveToolsPath('ParamXML', 'ParamLabels.csv'),
    resolveToolsPath('prc2json', 'ParamLabels.csv'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeHashLiteral(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue.toLowerCase().startsWith('0x')) {
    return trimmedValue;
  }

  const label = getParamLabelMap().get(trimmedValue.toLowerCase());
  return label || trimmedValue;
}

function normalizeHashForCompare(value: string) {
  return value.trim().toLowerCase();
}

function getParamLabelMap() {
  if (paramLabelMapCache) {
    return paramLabelMapCache;
  }

  paramLabelMapCache = new Map<string, string>();
  const labelsPath = resolveParamLabelsPath();
  if (!labelsPath || !fs.existsSync(labelsPath)) {
    return paramLabelMapCache;
  }

  const labelsText = fs.readFileSync(labelsPath, 'utf8');
  for (const line of labelsText.split(/\r?\n/)) {
    const [hash, ...labelParts] = line.split(',');
    const label = labelParts.join(',').trim();
    if (hash?.trim().toLowerCase().startsWith('0x') && label) {
      paramLabelMapCache.set(hash.trim().toLowerCase(), label);
    }
  }

  return paramLabelMapCache;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceNameId(value: string, sourceNameId: string, newNameId: string) {
  return value.replace(
    new RegExp(sourceNameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    newNameId,
  );
}

function renameEchoUiAssets(
  dirPath: string,
  sourceNameId: string,
  newNameId: string,
) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const currentPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      renameEchoUiAssets(currentPath, sourceNameId, newNameId);
    }

    const nextName = replaceNameId(entry.name, sourceNameId, newNameId);
    if (nextName === entry.name) {
      continue;
    }

    const nextPath = path.join(dirPath, nextName);
    if (fs.existsSync(nextPath)) {
      throw new Error(
        `Cannot rename mod file because target already exists: ${nextPath}`,
      );
    }
    fs.renameSync(currentPath, nextPath);
  }
}

function listFilesRecursive(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    return entry.isDirectory() ? listFilesRecursive(entryPath) : [entryPath];
  });
}

function disableConflictingEchoUiPatches(modPath: string) {
  const conflicts = [
    path.join('ui', 'message', 'msg_name.xmsbt'),
    path.join('ui', 'param', 'database', 'ui_chara_db.prcx'),
    path.join('ui', 'param', 'database', 'ui_layout_db.prcx'),
  ];
  const moved: string[] = [];
  for (const relativePath of conflicts) {
    const sourcePath = path.join(modPath, relativePath);
    if (!fs.existsSync(sourcePath)) continue;
    const backupPath = path.join(
      modPath,
      '.fightplanner-echo-backup',
      relativePath,
    );
    ensureDirectory(path.dirname(backupPath));
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    fs.renameSync(sourcePath, backupPath);
    moved.push(relativePath.replace(/\\/g, '/'));
  }
  return moved;
}

function backupEchoConfig(modPath: string) {
  const configPath = path.join(modPath, 'config.json');
  const backupRoot = path.join(modPath, '.fightplanner-echo-backup');
  const backupPath = path.join(backupRoot, 'config.json');
  const absentMarker = path.join(backupRoot, 'config.absent');
  ensureDirectory(backupRoot);
  if (fs.existsSync(backupPath) || fs.existsSync(absentMarker)) return;
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, backupPath);
  else fs.writeFileSync(absentMarker, '', 'utf8');
}

function restoreEchoBackups(modPath: string) {
  const backupRoot = path.join(modPath, '.fightplanner-echo-backup');
  const configPath = path.join(modPath, 'config.json');
  const backupConfig = path.join(backupRoot, 'config.json');
  const absentMarker = path.join(backupRoot, 'config.absent');
  if (fs.existsSync(backupConfig)) fs.copyFileSync(backupConfig, configPath);
  else if (fs.existsSync(absentMarker) && fs.existsSync(configPath))
    fs.unlinkSync(configPath);
  else if (fs.existsSync(backupRoot) && fs.existsSync(configPath)) {
    const generatedBackup = path.join(backupRoot, 'generated-config.json');
    if (fs.existsSync(generatedBackup)) fs.unlinkSync(generatedBackup);
    fs.renameSync(configPath, generatedBackup);
  }

  for (const relativePath of [
    path.join('ui', 'message', 'msg_name.xmsbt'),
    path.join('ui', 'param', 'database', 'ui_chara_db.prcx'),
    path.join('ui', 'param', 'database', 'ui_layout_db.prcx'),
  ]) {
    const backupPath = path.join(backupRoot, relativePath);
    if (!fs.existsSync(backupPath)) continue;
    const targetPath = path.join(modPath, relativePath);
    ensureDirectory(path.dirname(targetPath));
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    fs.renameSync(backupPath, targetPath);
  }
}

interface EchoDirectoryBackup {
  originalPath: string;
  backupPath: string;
  existed: boolean;
}

interface EchoFileSnapshot {
  filePath: string;
  contents: Buffer | null;
}

async function createEchoDirectoryBackup(
  dirPath: string,
): Promise<EchoDirectoryBackup> {
  const originalPath = path.resolve(dirPath);
  const parentPath = path.dirname(originalPath);
  const directoryName = path.basename(originalPath);
  if (!directoryName || originalPath === parentPath) {
    throw new Error(`Unsafe Echo backup path: ${originalPath}`);
  }

  const backupPath = path.join(
    parentPath,
    `.${directoryName}.fightplanner-echo-transaction-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const existed = fs.existsSync(originalPath);
  if (existed) {
    await fs.promises.cp(originalPath, backupPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }

  return { originalPath, backupPath, existed };
}

async function restoreEchoDirectoryBackup(backup: EchoDirectoryBackup) {
  if (!backup.existed) {
    if (fs.existsSync(backup.originalPath)) {
      await fs.promises.rm(backup.originalPath, {
        recursive: true,
        force: true,
      });
    }
    return;
  }

  if (!fs.existsSync(backup.backupPath)) {
    throw new Error(`Echo backup missing: ${backup.backupPath}`);
  }

  const failedPath = `${backup.backupPath}.failed`;
  if (fs.existsSync(failedPath)) {
    await fs.promises.rm(failedPath, { recursive: true, force: true });
  }
  if (fs.existsSync(backup.originalPath)) {
    await fs.promises.rename(backup.originalPath, failedPath);
  }

  try {
    await fs.promises.rename(backup.backupPath, backup.originalPath);
  } catch (error) {
    if (
      fs.existsSync(failedPath) &&
      !fs.existsSync(backup.originalPath)
    ) {
      await fs.promises.rename(failedPath, backup.originalPath);
    }
    throw error;
  }

  if (fs.existsSync(failedPath)) {
    await fs.promises.rm(failedPath, { recursive: true, force: true });
  }
}

async function removeEchoDirectoryBackup(backup: EchoDirectoryBackup) {
  if (fs.existsSync(backup.backupPath)) {
    await fs.promises.rm(backup.backupPath, {
      recursive: true,
      force: true,
    });
  }
}

function captureEchoFileSnapshots(filePaths: string[]): EchoFileSnapshot[] {
  return filePaths.map((filePath) => ({
    filePath,
    contents: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
  }));
}

function restoreEchoFileSnapshots(snapshots: EchoFileSnapshot[]) {
  for (const snapshot of snapshots) {
    if (snapshot.contents) {
      ensureDirectory(path.dirname(snapshot.filePath));
      fs.writeFileSync(snapshot.filePath, snapshot.contents);
    } else if (fs.existsSync(snapshot.filePath)) {
      fs.unlinkSync(snapshot.filePath);
    }
  }
}

function detectEchoModPath(
  baseNameId: string,
  echoNameId: string,
  echoSlots: string[],
) {
  const modsPath = store.get('modsPath') as string | null;
  if (!modsPath || !fs.existsSync(modsPath)) return null;
  const echoAssetPattern = new RegExp(`_${echoNameId}_`, 'i');
  const scored = fs
    .readdirSync(modsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const modPath = path.join(modsPath, entry.name);
      let score = fs.existsSync(path.join(modPath, '.fightplanner-echo-backup'))
        ? 10
        : 0;
      const uiFiles = [
        path.join(modPath, 'ui', 'replace', 'chara'),
        path.join(modPath, 'ui', 'replace_patch', 'chara'),
      ].flatMap(listFilesRecursive);
      if (
        uiFiles.some((filePath) =>
          echoAssetPattern.test(path.basename(filePath)),
        )
      )
        score += 20;
      const fighterFiles = listFilesRecursive(
        path.join(modPath, 'fighter', baseNameId),
      );
      if (
        fighterFiles.some((filePath) =>
          echoSlots.some((slot) =>
            filePath.includes(`${path.sep}${slot}${path.sep}`),
          ),
        )
      )
        score += 5;
      return { modPath, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored[0]?.modPath || null;
}

function mergeEchoConfig(generated: any, existing: any) {
  const merged = { ...existing, ...generated };
  const arraySections = ['new-dir-infos'];
  const objectSections = [
    'new-dir-infos-base',
    'share-to-vanilla',
    'share-to-added',
    'new-dir-files',
  ];

  arraySections.forEach((section) => {
    if (
      Array.isArray(generated?.[section]) ||
      Array.isArray(existing?.[section])
    ) {
      merged[section] = [
        ...new Set([
          ...(generated?.[section] || []),
          ...(existing?.[section] || []),
        ]),
      ];
    }
  });
  objectSections.forEach((section) => {
    const output: Record<string, unknown> = { ...(generated?.[section] || {}) };
    Object.entries(existing?.[section] || {}).forEach(([key, value]) => {
      if (Array.isArray(value) && Array.isArray(output[key])) {
        output[key] = [...new Set([...(output[key] as unknown[]), ...value])];
      } else if (!(key in output)) {
        output[key] = value;
      }
    });
    if (Object.keys(output).length > 0) {
      merged[section] = output;
    }
  });
  return merged;
}

function makeCrcTable() {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(value: string) {
  let crc = 0 ^ -1;
  for (let index = 0; index < value.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value.charCodeAt(index)) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function toHash40(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith('0x')) {
    return normalized;
  }

  const hash = (BigInt(normalized.length) << 32n) + BigInt(crc32(normalized));
  return `0x${hash.toString(16).padStart(10, '0').toUpperCase()}`;
}

function escapeXml(value: string | number | boolean) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clampParamXmlSbyteValue(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return String(
    Math.min(
      Math.max(Math.trunc(numericValue), MIN_PARAM_XML_SBYTE),
      MAX_PARAM_XML_SBYTE,
    ),
  );
}

function scalarParamToXml(type: string, entry: any, fallbackIndex: number) {
  const xmlTag = PARAM_XML_TAG_BY_COLLECTION[type] || type;
  const hash = toHash40(String(entry?.['@hash'] ?? fallbackIndex));
  const textValue = String(entry?.['#text'] ?? '');
  const value =
    type === 'hash40'
      ? toHash40(textValue)
      : type === 'sbyte'
        ? clampParamXmlSbyteValue(textValue)
        : textValue;
  return `<${xmlTag} hash="${hash}">${escapeXml(value)}</${xmlTag}>`;
}

function paramStructToXml(entry: any, index: number) {
  const structIndex = entry?.['@index'] ?? index;
  const lines = [`<struct index="${escapeXml(structIndex)}">`];

  for (const [key, value] of Object.entries(entry)) {
    if (key.startsWith('@')) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item, itemIndex) => {
        lines.push(`  ${scalarParamToXml(key, item, itemIndex)}`);
      });
      continue;
    }

    if (value && typeof value === 'object' && '#text' in value) {
      lines.push(`  ${scalarParamToXml(key, value, 0)}`);
    }
  }

  lines.push('</struct>');
  return lines.join('\n');
}

function charaJsonToParamXml(charaJson: any) {
  const list = charaJson?.struct?.list;
  const structs = getStructList(charaJson);
  const listHash = toHash40(String(list?.['@hash'] ?? 'db_root'));
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<struct>',
    `  <list size="${structs.length}" hash="${listHash}">`,
  ];

  structs.forEach((entry, index) => {
    lines.push(
      paramStructToXml(entry, index)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
    );
  });

  lines.push('  </list>', '</struct>', '');
  return lines.join('\n');
}

function getStructList(charaJson: any): any[] {
  const list = charaJson?.struct?.list?.struct;
  if (!Array.isArray(list)) {
    throw new Error('Invalid ui_chara_db JSON: missing struct.list.struct');
  }

  return list;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === 'undefined' ? [] : [value];
}

function normalizeParamXmlStruct(entry: any) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  const mappings: Array<[string, string, boolean]> = [
    ['Hash40', 'hash40', true],
    ['String', 'string', false],
    ['I16', 'short', false],
    ['I32', 'int', true],
    ['I8', 'sbyte', true],
    ['Bool', 'bool', true],
    ['U8', 'byte', true],
    ['F32', 'float', true],
    ['Float', 'float', true],
  ];

  mappings.forEach(([sourceKey, targetKey, targetIsArray]) => {
    if (typeof entry[sourceKey] === 'undefined') {
      return;
    }

    entry[targetKey] = targetIsArray
      ? asArray(entry[sourceKey])
      : asArray(entry[sourceKey])[0];
    delete entry[sourceKey];
  });

  return entry;
}

function normalizeCharaParamJson(charaJson: any) {
  const structs = asArray(charaJson?.struct?.list?.struct);
  if (!charaJson?.struct?.list || structs.length === 0) {
    throw new Error('Invalid ui_chara_db.prc: missing character structs');
  }

  if (typeof charaJson.struct.list['@hash'] === 'string') {
    charaJson.struct.list['@hash'] = normalizeHashLiteral(
      charaJson.struct.list['@hash'],
    );
  }

  structs.forEach((entry: any, index) => {
    normalizeParamXmlStruct(entry);
    entry['@index'] = String(entry['@index'] ?? index);
    ['hash40', 'int', 'sbyte', 'bool', 'byte', 'float'].forEach((key) => {
      entry[key] = asArray(entry[key]);
      entry[key].forEach((param: any) => {
        if (typeof param?.['@hash'] === 'string') {
          param['@hash'] = normalizeHashLiteral(param['@hash']);
        }
        if (
          key === 'hash40' &&
          typeof param?.['#text'] === 'string' &&
          param['#text'].trim().toLowerCase().startsWith('0x')
        ) {
          param['#text'] = normalizeHashLiteral(param['#text']);
        }
      });
    });

    ['string', 'short'].forEach((key) => {
      if (typeof entry?.[key]?.['@hash'] === 'string') {
        entry[key]['@hash'] = normalizeHashLiteral(entry[key]['@hash']);
      }
    });
  });

  charaJson.struct.list.struct = structs;
  charaJson.struct.list['@size'] = String(
    charaJson.struct.list['@size'] ?? structs.length,
  );
  return charaJson;
}

function charaXmlToJson(xmlContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
  });

  return normalizeCharaParamJson(parser.parse(xmlContent));
}

function findHashIndex(entries: any, hash: string) {
  if (!Array.isArray(entries)) {
    return -1;
  }

  const expectedHashes = new Set([
    normalizeHashForCompare(hash),
    normalizeHashForCompare(toHash40(hash)),
  ]);

  return entries.findIndex((entry) => {
    if (typeof entry?.['@hash'] !== 'string') {
      return false;
    }

    const entryHash = normalizeHashForCompare(entry['@hash']);
    const entryLabel = normalizeHashForCompare(normalizeHashLiteral(entryHash));
    return expectedHashes.has(entryHash) || expectedHashes.has(entryLabel);
  });
}

function looksLikeUiLayoutEntry(entry: any) {
  const firstHash = String(entry?.hash40?.[0]?.['@hash'] || '');
  const normalizedFirstHash = normalizeHashLiteral(firstHash);
  return (
    normalizedFirstHash === 'ui_layout_id' ||
    findHashIndex(entry?.hash40, 'ui_layout_id') >= 0 ||
    findHashIndex(entry?.byte, 'chara_color') >= 0
  );
}

function getCssManagerFieldIndex(entry: any, collection: string, hash: string) {
  if (looksLikeUiLayoutEntry(entry)) {
    const layoutIndex = CSS_MANAGER_LAYOUT_FIELD_INDEX[collection]?.[hash];
    if (typeof layoutIndex === 'number') {
      return layoutIndex;
    }
  }

  return CSS_MANAGER_FIELD_INDEX[collection]?.[hash] ?? -1;
}

function getHashText(
  entry: any,
  collection: string,
  hash: string,
  fallback = '',
) {
  const index = findHashIndex(entry?.[collection], hash);
  if (index >= 0) {
    return String(entry[collection][index]?.['#text'] ?? fallback);
  }

  const cssManagerIndex = getCssManagerFieldIndex(entry, collection, hash);
  if (
    cssManagerIndex >= 0 &&
    Array.isArray(entry?.[collection]) &&
    entry[collection][cssManagerIndex]
  ) {
    return String(entry[collection][cssManagerIndex]?.['#text'] ?? fallback);
  }

  return fallback;
}

function setHashText(
  entry: any,
  collection: string,
  hash: string,
  value: string | number | boolean,
) {
  let index = findHashIndex(entry?.[collection], hash);
  if (index < 0) {
    index = getCssManagerFieldIndex(entry, collection, hash);
  }
  if (index < 0) {
    throw new Error(
      `Missing ${collection} field "${hash}" for ${entry?.string?.['#text'] || 'character'}`,
    );
  }

  if (!Array.isArray(entry?.[collection]) || !entry[collection][index]) {
    throw new Error(
      `Missing ${collection}[${index}] field "${hash}" for ${entry?.string?.['#text'] || 'character'}`,
    );
  }

  entry[collection][index]['#text'] = String(value);
}

function setHashTextIfPresent(
  entry: any,
  collection: string,
  hash: string,
  value: string | number | boolean,
) {
  let index = findHashIndex(entry?.[collection], hash);
  if (index < 0) {
    index = getCssManagerFieldIndex(entry, collection, hash);
  }
  if (
    index >= 0 &&
    Array.isArray(entry?.[collection]) &&
    entry[collection][index]
  ) {
    entry[collection][index]['#text'] = String(value);
  }
}

function getCharacterCssSbyteOrder(order: number) {
  return Math.min(Math.max(order, 0), MAX_PARAM_XML_SBYTE);
}

function ensureHashText(
  entry: any,
  collection: string,
  hash: string,
  value: string | number | boolean,
) {
  if (!Array.isArray(entry?.[collection])) {
    entry[collection] = [];
  }

  let index = findHashIndex(entry[collection], hash);
  if (index < 0) {
    index = getCssManagerFieldIndex(entry, collection, hash);
  }
  if (index >= 0) {
    if (entry[collection][index]) {
      entry[collection][index]['#text'] = String(value);
      return;
    }
  }

  entry[collection].push({
    '@hash': hash,
    '#text': String(value),
  });
}

function createMsgNameMap(msgNameJson: any) {
  const map = new Map<string, any>();
  for (const entry of msgNameJson?.strings ?? []) {
    if (typeof entry?.label === 'string') {
      map.set(entry.label, entry);
    }
  }
  for (const [label, value] of Object.entries(
    msgNameJson?.added_labels ?? {},
  )) {
    if (!map.has(label)) {
      map.set(label, { label, value });
    }
  }
  return map;
}

function normalizeMsgValue(value: string) {
  return value.replace(/\r\n/g, '\r\r\n');
}

function denormalizeMsgValue(value: string) {
  return value.replace(/\r\r\n/g, '\r\n');
}

function getDisplayName(nameId: string, msgNameJson: any) {
  const label = `nam_chr1_00_${nameId}`;
  const entry = createMsgNameMap(msgNameJson).get(label);
  const value =
    typeof entry?.value === 'string' ? denormalizeMsgValue(entry.value) : '';

  if (value.trim()) {
    return value.trim();
  }

  return nameId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeGroupId(value: string) {
  const normalized = value.trim();
  if (!normalized || /^0x0+$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function getMsgValue(msgNameJson: any, label: string) {
  const entry = createMsgNameMap(msgNameJson).get(label);
  return typeof entry?.value === 'string'
    ? denormalizeMsgValue(entry.value)
    : '';
}

function setMsgValue(msgNameJson: any, label: string, value: string) {
  const normalizedValue = normalizeMsgValue(value);
  const entry = (msgNameJson?.strings ?? []).find(
    (candidate: any) => candidate?.label === label,
  );

  if (entry) {
    entry.value = normalizedValue;
    return;
  }

  if (
    !msgNameJson.added_labels ||
    typeof msgNameJson.added_labels !== 'object'
  ) {
    msgNameJson.added_labels = {};
  }
  msgNameJson.added_labels[label] = normalizedValue;
}

function buildCharacterSlots(entry: any, msgNameJson: any): CharacterCssSlot[] {
  const colorNum = Number(getHashText(entry, 'byte', 'color_num', '0'));
  const nameId = String(entry?.string?.['#text'] || '');
  const slots: CharacterCssSlot[] = [];

  for (let slotIndex = 0; slotIndex < Math.max(1, colorNum); slotIndex += 1) {
    const slotKey = String(slotIndex).padStart(2, '0');
    const nxxIndex = getHashText(entry, 'byte', `n${slotKey}_index`, slotKey);
    const cxxIndex = getHashText(entry, 'byte', `c${slotKey}_index`, slotKey);
    const nxxKey = String(nxxIndex).padStart(2, '0');
    const textKey = `${nxxKey}_${nameId}`;

    slots.push({
      slotIndex,
      cxxIndex,
      nxxIndex,
      characallLabel: getHashText(
        entry,
        'hash40',
        `characall_label_c${nxxKey}`,
        '',
      ),
      namChr0: getMsgValue(msgNameJson, `nam_chr0_${textKey}`),
      namChr1: getMsgValue(msgNameJson, `nam_chr1_${textKey}`),
      namChr2: getMsgValue(msgNameJson, `nam_chr2_${textKey}`),
      namChr3: getMsgValue(msgNameJson, `nam_chr3_${textKey}`),
      namStageName: getMsgValue(msgNameJson, `nam_stage_name_${textKey}`),
    });
  }

  return slots;
}

function buildCharacterEntry(entry: any, msgNameJson: any): CharacterCssEntry {
  const nameId = String(entry?.string?.['#text'] || '');
  const uiCharaId = getHashText(
    entry,
    'hash40',
    'ui_chara_id',
    `ui_chara_${nameId}`,
  );
  const order = Number(getHashText(entry, 'sbyte', 'disp_order', '-1'));
  const canSelect =
    getHashText(entry, 'bool', 'can_select', 'False') === 'True';
  const isGroup = getHashText(entry, 'byte', 'is_group', '0') === '1';

  return {
    id: uiCharaId,
    nameId,
    displayName: getDisplayName(nameId, msgNameJson),
    number: '',
    imageUrl: null,
    order,
    hidden: order < 0,
    canSelect,
    isRandom: nameId === 'random',
    uiSeriesId: getHashText(entry, 'hash40', 'ui_series_id', ''),
    fighterKind: getHashText(entry, 'hash40', 'fighter_kind', ''),
    fighterKindCorps: getHashText(entry, 'hash40', 'fighter_kind_corps', ''),
    altCharaId: getHashText(entry, 'hash40', 'alt_chara_id', ''),
    fighterType: getHashText(entry, 'hash40', 'fighter_type', ''),
    exhibitYear: String(entry?.short?.['#text'] ?? ''),
    colorNum: getHashText(entry, 'byte', 'color_num', '0'),
    colorStartIndex: getHashText(entry, 'byte', 'color_start_index', '0'),
    isMii: getHashText(entry, 'bool', 'is_mii', 'False') === 'True',
    isBoss: getHashText(entry, 'bool', 'is_boss', 'False') === 'True',
    isHiddenBoss:
      getHashText(entry, 'bool', 'is_hidden_boss', 'False') === 'True',
    isGroup,
    groupId: normalizeGroupId(getHashText(entry, 'hash40', 'group_hash', '')),
    slots: isGroup ? [] : buildCharacterSlots(entry, msgNameJson),
  };
}

function collectCharacterCssDebugSnapshot(charaJson: any, msgNameJson?: any) {
  const structs = getStructList(charaJson);
  const entries = structs.map((entry) => {
    const nameId = String(entry?.string?.['#text'] || '');
    const uiCharaId = getHashText(entry, 'hash40', 'ui_chara_id', '');
    const dispOrder = getHashText(entry, 'sbyte', 'disp_order', 'MISSING');
    const canSelect = getHashText(entry, 'bool', 'can_select', 'MISSING');
    return {
      nameId,
      uiCharaId,
      dispOrder,
      canSelect,
      rawSbyteHashes: asArray(entry?.sbyte).map((item: any) => item?.['@hash']),
      rawBoolHashes: asArray(entry?.bool).map((item: any) => item?.['@hash']),
    };
  });
  const hiddenCount = entries.filter(
    (entry) => Number(entry.dispOrder) < 0,
  ).length;
  const missingDispOrderCount = entries.filter(
    (entry) => entry.dispOrder === 'MISSING',
  ).length;
  const missingUiCharaIdCount = entries.filter(
    (entry) => !entry.uiCharaId,
  ).length;

  return {
    structCount: structs.length,
    msgNameStringCount: Array.isArray(msgNameJson?.strings)
      ? msgNameJson.strings.length
      : undefined,
    visibleCount: entries.filter((entry) => Number(entry.dispOrder) >= 0)
      .length,
    hiddenCount,
    missingDispOrderCount,
    missingUiCharaIdCount,
    sample: entries.slice(0, 5),
  };
}

function readCurrentCharaJson() {
  requireImportedCharacterCssSource();

  const persistedPath = getPersistedCharaJsonPath();
  if (fs.existsSync(persistedPath)) {
    return {
      source: 'saved' as const,
      json: normalizeCharaParamJson(readJsonFile<any>(persistedPath)),
    };
  }

  return {
    source: 'canonical' as const,
    json: (() => {
      throw new Error('Character CSS source missing');
    })(),
  };
}

function readCurrentLayoutJson() {
  requireImportedCharacterCssSource();

  const persistedPath = getPersistedLayoutJsonPath();
  if (fs.existsSync(persistedPath)) {
    return normalizeCharaParamJson(readJsonFile<any>(persistedPath));
  }

  throw new Error('Character CSS layout source missing');
}

function readCurrentMsgNameJson() {
  requireImportedCharacterCssSource();

  const persistedPath = getPersistedMsgNameJsonPath();
  if (fs.existsSync(persistedPath)) {
    return readJsonFile<any>(persistedPath);
  }

  throw new Error('Character CSS source missing');
}

function writePersistedCharacterCssData(
  charaJson: any,
  msgNameJson: any,
  layoutJson?: any,
) {
  fs.writeFileSync(
    getPersistedCharaJsonPath(),
    JSON.stringify(charaJson),
    'utf8',
  );
  fs.writeFileSync(
    getPersistedMsgNameJsonPath(),
    JSON.stringify(msgNameJson),
    'utf8',
  );
  if (layoutJson) {
    fs.writeFileSync(
      getPersistedLayoutJsonPath(),
      JSON.stringify(layoutJson),
      'utf8',
    );
  }
}

function validateLayoutPayload(
  charaJson: any,
  payload: CharacterCssLayoutPayload,
) {
  const sourceIds = getStructList(charaJson).map((entry) =>
    getHashText(entry, 'hash40', 'ui_chara_id', ''),
  );
  const orderedIds = [
    ...(payload.visibleCharacterIds || []),
    ...(payload.hiddenCharacterIds || []),
    ...Object.values(payload.groups || {}).flat(),
  ];

  if (orderedIds.length !== sourceIds.length) {
    throw new Error(
      `Expected ${sourceIds.length} characters, received ${orderedIds.length}`,
    );
  }

  const sourceCounts = sourceIds.reduce((counts, id) => {
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const payloadCounts = orderedIds.reduce((counts, id) => {
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  const invalidIds = [...payloadCounts.keys()].filter(
    (id) => !sourceCounts.has(id),
  );
  if (invalidIds.length > 0) {
    throw new Error(
      `Unknown character identifiers received: ${invalidIds.join(', ')}`,
    );
  }

  const mismatchedIds = [...sourceCounts.entries()]
    .filter(([id, count]) => payloadCounts.get(id) !== count)
    .map(
      ([id, count]) =>
        `${id} expected ${count}, received ${payloadCounts.get(id) || 0}`,
    );
  if (mismatchedIds.length > 0) {
    throw new Error(
      `Character identifier counts do not match source: ${mismatchedIds.join('; ')}`,
    );
  }
}

function applyCreatedCharacterCssGroups(
  charaJson: any,
  msgNameJson: any,
  createdGroups: CharacterCssGroupCreate[] | undefined,
) {
  if (!createdGroups?.length) {
    return;
  }

  const structs = getStructList(charaJson);
  const existingIds = new Set(
    structs.map((entry) => getHashText(entry, 'hash40', 'ui_chara_id', '')),
  );
  const existingNameIds = new Set(
    structs.map((entry) => String(entry?.string?.['#text'] || '')),
  );

  for (const group of createdGroups) {
    const id = group.id.trim();
    const nameId = group.nameId.trim();
    const displayName = group.displayName.trim();
    if (!id.startsWith('ui_chara_')) {
      throw new Error(`Group ID must start with ui_chara_: ${id || '(empty)'}`);
    }
    if (!nameId || !displayName) {
      throw new Error('Group Name ID and display name cannot be empty');
    }
    if (existingIds.has(id)) {
      throw new Error(`Character or group ID already exists: ${id}`);
    }
    if (existingNameIds.has(nameId)) {
      throw new Error(`Character or group Name ID already exists: ${nameId}`);
    }

    structs.push({
      '@index': String(structs.length),
      hash40: [
        {
          '@hash': 'ui_chara_id',
          '#text': id,
        },
      ],
      string: {
        '@hash': 'name_id',
        '#text': nameId,
      },
      sbyte: [
        {
          '@hash': 'disp_order',
          '#text': '0',
        },
      ],
      byte: [
        {
          '@hash': 'is_group',
          '#text': '1',
        },
      ],
    });
    setMsgValue(msgNameJson, `nam_chr1_00_${nameId}`, displayName);
    existingIds.add(id);
    existingNameIds.add(nameId);
  }

  charaJson.struct.list.struct = structs;
  if (charaJson.struct.list['@size']) {
    charaJson.struct.list['@size'] = String(structs.length);
  }
}

function updateMsgNameJson(
  msgNameJson: any,
  renamedCharacters: Record<string, string> | undefined,
) {
  if (!renamedCharacters || Object.keys(renamedCharacters).length === 0) {
    return msgNameJson;
  }

  for (const [nameId, displayName] of Object.entries(renamedCharacters)) {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      continue;
    }

    const label = `nam_chr1_00_${nameId}`;
    setMsgValue(msgNameJson, label, trimmedName);
  }

  return msgNameJson;
}

function duplicateNameLabels(
  msgNameJson: any,
  sourceNameId: string,
  newNameId: string,
  newDisplayName?: string | null,
) {
  const sourceStrings = Array.isArray(msgNameJson.strings)
    ? [...msgNameJson.strings]
    : [];
  const originalStringCount = Number(msgNameJson?.TXT2?.NumberOfStrings);
  if (
    Number.isInteger(originalStringCount) &&
    originalStringCount >= 0 &&
    sourceStrings.length > originalStringCount
  ) {
    const accidentallyAppended = sourceStrings.splice(originalStringCount);
    msgNameJson.strings = sourceStrings;
    if (
      !msgNameJson.added_labels ||
      typeof msgNameJson.added_labels !== 'object'
    ) {
      msgNameJson.added_labels = {};
    }
    accidentallyAppended.forEach((entry) => {
      if (
        typeof entry?.label === 'string' &&
        typeof entry?.value === 'string'
      ) {
        msgNameJson.added_labels[entry.label] = entry.value;
      }
    });
  }
  const existingLabels = new Set(
    sourceStrings
      .map((entry) => entry?.label)
      .filter((label): label is string => typeof label === 'string'),
  );
  Object.keys(msgNameJson.added_labels || {}).forEach((label) =>
    existingLabels.add(label),
  );

  for (const entry of sourceStrings) {
    const label = String(entry?.label || '');
    if (
      !label.endsWith(`_${sourceNameId}`) &&
      !label.includes(`_${sourceNameId}_`)
    ) {
      continue;
    }

    const newLabel = label.replace(sourceNameId, newNameId);
    setMsgValue(msgNameJson, newLabel, String(entry?.value || ''));
    existingLabels.add(newLabel);
  }

  for (const [label, value] of Object.entries(msgNameJson.added_labels || {})) {
    if (
      !label.endsWith(`_${sourceNameId}`) &&
      !label.includes(`_${sourceNameId}_`)
    )
      continue;
    const newLabel = label.replace(sourceNameId, newNameId);
    if (!existingLabels.has(newLabel)) {
      setMsgValue(msgNameJson, newLabel, String(value));
      existingLabels.add(newLabel);
    }
  }

  if (newDisplayName?.trim()) {
    setMsgValue(msgNameJson, `nam_chr1_00_${newNameId}`, newDisplayName.trim());
  }
}

function applyCharacterUpdates(
  charaJson: any,
  msgNameJson: any,
  characterUpdates: Record<string, CharacterCssUpdate> | undefined,
) {
  if (!characterUpdates) {
    return;
  }

  const entryById = new Map(
    getStructList(charaJson).map(
      (entry) =>
        [getHashText(entry, 'hash40', 'ui_chara_id', ''), entry] as const,
    ),
  );

  for (const [id, update] of Object.entries(characterUpdates)) {
    const entry = entryById.get(id);
    if (!entry) {
      continue;
    }

    const currentNameId = String(entry?.string?.['#text'] || '');
    const nextNameId = update.nameId?.trim() || currentNameId;

    if (update.uiCharaId) {
      setHashText(entry, 'hash40', 'ui_chara_id', update.uiCharaId.trim());
    }
    if (update.uiSeriesId) {
      setHashText(entry, 'hash40', 'ui_series_id', update.uiSeriesId.trim());
    }
    if (update.fighterKind) {
      setHashText(entry, 'hash40', 'fighter_kind', update.fighterKind.trim());
    }
    if (update.fighterKindCorps) {
      setHashText(
        entry,
        'hash40',
        'fighter_kind_corps',
        update.fighterKindCorps.trim(),
      );
    }
    if (update.altCharaId) {
      setHashText(entry, 'hash40', 'alt_chara_id', update.altCharaId.trim());
    }
    if (update.fighterType) {
      setHashText(entry, 'hash40', 'fighter_type', update.fighterType.trim());
    }
    if (update.nameId) {
      entry.string['#text'] = nextNameId;
    }
    if (typeof update.exhibitYear === 'string' && entry.short) {
      entry.short['#text'] = update.exhibitYear;
    }
    if (typeof update.colorNum === 'string') {
      setHashText(entry, 'byte', 'color_num', update.colorNum);
    }
    if (typeof update.colorStartIndex === 'string') {
      ensureHashText(
        entry,
        'byte',
        'color_start_index',
        update.colorStartIndex,
      );
    }
    if (typeof update.canSelect === 'boolean') {
      setHashTextIfPresent(
        entry,
        'bool',
        'can_select',
        update.canSelect ? 'True' : 'False',
      );
    }
    if (typeof update.isMii === 'boolean') {
      setHashTextIfPresent(
        entry,
        'bool',
        'is_mii',
        update.isMii ? 'True' : 'False',
      );
    }
    if (typeof update.isBoss === 'boolean') {
      setHashTextIfPresent(
        entry,
        'bool',
        'is_boss',
        update.isBoss ? 'True' : 'False',
      );
    }
    if (typeof update.isHiddenBoss === 'boolean') {
      setHashTextIfPresent(
        entry,
        'bool',
        'is_hidden_boss',
        update.isHiddenBoss ? 'True' : 'False',
      );
    }

    for (const [slotKey, slotUpdate] of Object.entries(update.slots || {})) {
      const slotIndex = Number(slotKey);
      if (!Number.isInteger(slotIndex) || slotIndex < 0) {
        continue;
      }

      const paddedSlot = String(slotIndex).padStart(2, '0');
      const nxxIndex =
        slotUpdate.nxxIndex ??
        getHashText(entry, 'byte', `n${paddedSlot}_index`, paddedSlot);
      const cxxIndex =
        slotUpdate.cxxIndex ??
        getHashText(entry, 'byte', `c${paddedSlot}_index`, paddedSlot);
      const paddedNxx = String(nxxIndex).padStart(2, '0');
      const textKey = `${paddedNxx}_${nextNameId}`;

      ensureHashText(entry, 'byte', `n${paddedSlot}_index`, nxxIndex);
      ensureHashText(entry, 'byte', `c${paddedSlot}_index`, cxxIndex);

      if (typeof slotUpdate.characallLabel === 'string') {
        ensureHashText(
          entry,
          'hash40',
          `characall_label_c${paddedNxx}`,
          slotUpdate.characallLabel.trim(),
        );
      }
      if (typeof slotUpdate.namChr0 === 'string') {
        setMsgValue(msgNameJson, `nam_chr0_${textKey}`, slotUpdate.namChr0);
      }
      if (typeof slotUpdate.namChr1 === 'string') {
        setMsgValue(msgNameJson, `nam_chr1_${textKey}`, slotUpdate.namChr1);
      }
      if (typeof slotUpdate.namChr2 === 'string') {
        setMsgValue(msgNameJson, `nam_chr2_${textKey}`, slotUpdate.namChr2);
      }
      if (typeof slotUpdate.namChr3 === 'string') {
        setMsgValue(msgNameJson, `nam_chr3_${textKey}`, slotUpdate.namChr3);
      }
      if (typeof slotUpdate.namStageName === 'string') {
        setMsgValue(
          msgNameJson,
          `nam_stage_name_${textKey}`,
          slotUpdate.namStageName,
        );
      }
    }
  }
}

function applyLayoutToCharaJson(
  charaJson: any,
  payload: CharacterCssLayoutPayload,
) {
  validateLayoutPayload(charaJson, payload);

  const entriesById = getStructList(charaJson).reduce((entries, entry) => {
    const id = getHashText(entry, 'hash40', 'ui_chara_id', '');
    const matchingEntries = entries.get(id) || [];
    matchingEntries.push(entry);
    entries.set(id, matchingEntries);
    return entries;
  }, new Map<string, any[]>());
  const nextEntries: any[] = [];

  payload.visibleCharacterIds.forEach((id, index) => {
    const entry = entriesById.get(id)?.shift();
    if (!entry) {
      return;
    }

    const sbyteOrder = getCharacterCssSbyteOrder(index);
    setHashTextIfPresent(entry, 'sbyte', 'skill_list_order', sbyteOrder);
    setHashText(entry, 'sbyte', 'disp_order', sbyteOrder);
    setHashTextIfPresent(
      entry,
      'bool',
      'can_select',
      entry?.string?.['#text'] === 'random' ? 'False' : 'True',
    );
    setHashTextIfPresent(entry, 'hash40', 'group_hash', '');
    nextEntries.push(entry);
  });

  payload.hiddenCharacterIds.forEach((id) => {
    const entry = entriesById.get(id)?.shift();
    if (!entry) {
      return;
    }

    setHashText(entry, 'sbyte', 'disp_order', -1);
    setHashTextIfPresent(entry, 'bool', 'can_select', 'False');
    setHashTextIfPresent(entry, 'hash40', 'group_hash', '');
    nextEntries.push(entry);
  });

  for (const [groupId, characterIds] of Object.entries(payload.groups || {})) {
    characterIds.forEach((id, index) => {
      const entry = entriesById.get(id)?.shift();
      if (!entry) {
        return;
      }

      setHashText(
        entry,
        'sbyte',
        'disp_order',
        getCharacterCssSbyteOrder(index),
      );
      ensureHashText(entry, 'hash40', 'group_hash', groupId);
      nextEntries.push(entry);
    });
  }

  charaJson.struct.list.struct = nextEntries.map((entry, index) => ({
    ...entry,
    '@index': String(index),
  }));
  if (charaJson.struct.list['@size']) {
    charaJson.struct.list['@size'] = String(nextEntries.length);
  }
  return charaJson;
}

function resolveParamXmlExecutable() {
  let relativeExecutablePath: string;

  switch (process.platform) {
    case 'win32':
      relativeExecutablePath = path.join('ParamXML', 'windows', 'ParamXML.exe');
      break;
    case 'darwin':
      relativeExecutablePath = path.join('ParamXML', 'osx', 'ParamXML');
      break;
    case 'linux':
      relativeExecutablePath = path.join('ParamXML', 'linux', 'ParamXML');
      break;
    default:
      throw new Error(`Unsupported platform for ParamXML: ${process.platform}`);
  }

  const executablePath = resolveToolsPath(relativeExecutablePath);
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `ParamXML executable not found for ${process.platform}: ${executablePath}`,
    );
  }

  return prepareExecutableTool(executablePath);
}

function runParamXml(inputXmlPath: string) {
  const executablePath = resolveParamXmlExecutable();
  const workingDirectory = path.dirname(inputXmlPath);
  const outputPath = path.join(
    workingDirectory,
    `${path.basename(inputXmlPath, path.extname(inputXmlPath))}.prc`,
  );

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  return new Promise<ToolExecutionResult & { outputPath: string }>(
    (resolve, reject) => {
      const child = spawn(executablePath, ['-a', inputXmlPath], {
        cwd: workingDirectory,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (exitCode) => {
        if (exitCode !== 0) {
          reject(
            new Error(
              `ParamXML exited with code ${exitCode}.${stderr ? ` ${stderr.trim()}` : ''}`,
            ),
          );
          return;
        }
        if (!fs.existsSync(outputPath)) {
          reject(
            new Error(
              `ParamXML completed but did not generate ${path.basename(outputPath)}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr, outputPath });
      });
    },
  );
}

function runParamXmlDisassemble(inputPrcPath: string, outputXmlPath: string) {
  const executablePath = resolveParamXmlExecutable();
  const workingDirectory = path.dirname(inputPrcPath);

  if (fs.existsSync(outputXmlPath)) {
    fs.unlinkSync(outputXmlPath);
  }

  const labelsPath = resolveParamLabelsPath();
  const args = ['-d', inputPrcPath, '-o', outputXmlPath];
  if (labelsPath) {
    args.push('-l', labelsPath);
  }

  return new Promise<ToolExecutionResult & { outputPath: string }>(
    (resolve, reject) => {
      const child = spawn(executablePath, args, {
        cwd: workingDirectory,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);
      child.on('close', (exitCode) => {
        if (exitCode !== 0) {
          reject(
            new Error(
              `ParamXML exited with code ${exitCode}.${stderr ? ` ${stderr.trim()}` : ''}`,
            ),
          );
          return;
        }

        if (!fs.existsSync(outputXmlPath)) {
          reject(
            new Error('ParamXML completed but did not generate XML output'),
          );
          return;
        }

        resolve({ stdout, stderr, outputPath: outputXmlPath });
      });
    },
  );
}

function resolveMsbtEditorExecutable() {
  let relativeExecutablePath: string;

  switch (process.platform) {
    case 'win32':
      relativeExecutablePath = path.join(
        'MSBTEditorCLI',
        'win-x64',
        'MSBTEditorCli.exe',
      );
      break;
    case 'darwin':
      relativeExecutablePath = path.join(
        'MSBTEditorCLI',
        process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64',
        'MSBTEditorCli',
      );
      break;
    case 'linux':
      relativeExecutablePath = path.join(
        'MSBTEditorCLI',
        'linux-x64',
        'MSBTEditorCli',
      );
      break;
    default:
      throw new Error(
        `Unsupported platform for MSBTEditorCLI: ${process.platform}`,
      );
  }

  const executablePath = resolveToolsPath(relativeExecutablePath);
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `MSBTEditorCLI executable not found for ${process.platform}/${process.arch}: ${executablePath}`,
    );
  }

  const patchedAssemblyPath = resolveToolsPath(
    'MSBTEditorCLI',
    'MSBTEditorCli.dll',
  );
  if (!fs.existsSync(patchedAssemblyPath)) {
    throw new Error(
      `Patched MSBTEditorCLI assembly not found: ${patchedAssemblyPath}`,
    );
  }

  return prepareMsbtEditorExecutable(executablePath, patchedAssemblyPath);
}

function runNativeTool(executablePath: string, args: string[]) {
  return new Promise<ToolExecutionResult>((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: path.dirname(executablePath),
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `${path.basename(executablePath)} exited with code ${exitCode}.${stderr ? ` ${stderr.trim()}` : ''}`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function runDotnetTool(toolPath: string, args: string[]) {
  if (!fs.existsSync(toolPath)) {
    throw new Error(`Required tool not found: ${toolPath}`);
  }

  return new Promise<ToolExecutionResult>((resolve, reject) => {
    const child = spawn('dotnet', [toolPath, ...args], {
      env: { ...process.env, DOTNET_ROLL_FORWARD: 'Major' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            'dotnet is required to save the Character CSS Layout, but it was not found in PATH. Install the .NET runtime and restart FightPlanner.',
          ),
        );
        return;
      }

      reject(error);
    });
    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `dotnet ${path.basename(toolPath)} exited with code ${exitCode}.${stderr ? ` ${stderr.trim()}` : ''}`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function runMsbtToJson(inputMsbtPath: string, outputJsonPath: string) {
  if (fs.existsSync(outputJsonPath)) {
    fs.unlinkSync(outputJsonPath);
  }

  const msbtToolPath = resolveMsbtEditorExecutable();
  return runNativeTool(msbtToolPath, [inputMsbtPath, outputJsonPath]);
}

async function runPrcToJson(inputPrcPath: string, outputJsonPath: string) {
  if (fs.existsSync(outputJsonPath)) {
    fs.unlinkSync(outputJsonPath);
  }

  const prcToolPath = resolveToolsPath('prc2json', 'prc2json.dll');
  const args = ['-d', inputPrcPath, '-o', outputJsonPath];
  const labelsPath = resolveParamLabelsPath();
  if (labelsPath) {
    args.push('-l', labelsPath);
  }

  return runDotnetTool(prcToolPath, args);
}

export async function importCharacterCssSourceFiles(
  payload: CharacterCssSourceImportPayload,
) {
  const prcPath = payload.prcPath?.trim();
  const layoutPrcPath = payload.layoutPrcPath?.trim();
  const msgNamePath = payload.msgNamePath?.trim();

  if (!prcPath || path.basename(prcPath) !== SOURCE_CHARA_PRC_FILE) {
    throw new Error(`Select ${SOURCE_CHARA_PRC_FILE}`);
  }
  if (
    !layoutPrcPath ||
    path.basename(layoutPrcPath) !== SOURCE_LAYOUT_PRC_FILE
  ) {
    throw new Error(`Select ${SOURCE_LAYOUT_PRC_FILE}`);
  }
  if (!msgNamePath || path.basename(msgNamePath) !== GENERATED_MSG_NAME_FILE) {
    throw new Error(`Select ${GENERATED_MSG_NAME_FILE}`);
  }
  if (!fs.existsSync(prcPath)) {
    throw new Error(`Character PRC not found: ${prcPath}`);
  }
  if (!fs.existsSync(layoutPrcPath)) {
    throw new Error(`Layout PRC not found: ${layoutPrcPath}`);
  }
  if (!fs.existsSync(msgNamePath)) {
    throw new Error(`MSBT not found: ${msgNamePath}`);
  }

  const tempCssDir = getTempCssDir();
  const tempCharaJsonPath = path.join(tempCssDir, TEMP_CHARA_JSON_FILE);
  const tempLayoutJsonPath = path.join(tempCssDir, TEMP_LAYOUT_JSON_FILE);
  const tempCharaXmlPath = path.join(tempCssDir, 'ui_chara_db_source.xml');
  const tempLayoutXmlPath = path.join(tempCssDir, 'ui_layout_db_source.xml');
  const tempMsgNameJsonPath = path.join(tempCssDir, TEMP_MSG_NAME_JSON_FILE);

  let charaJson: any;
  let layoutJson: any;
  try {
    logCharacterCss('Import source started', {
      prcPath,
      layoutPrcPath,
      msgNamePath,
      paramLabelsPath: resolveParamLabelsPath(),
    });
    await runPrcToJson(prcPath, tempCharaJsonPath);
    await runPrcToJson(layoutPrcPath, tempLayoutJsonPath);
    charaJson = normalizeCharaParamJson(readJsonFile<any>(tempCharaJsonPath));
    layoutJson = normalizeCharaParamJson(readJsonFile<any>(tempLayoutJsonPath));
    logCharacterCss('PRC converted with prc2json', {
      outputPath: tempCharaJsonPath,
      layoutOutputPath: tempLayoutJsonPath,
      ...collectCharacterCssDebugSnapshot(charaJson),
      layoutStructCount: getStructList(layoutJson).length,
    });
  } catch (error) {
    logCharacterCss('prc2json failed, falling back to ParamXML', {
      error: error instanceof Error ? error.message : String(error),
      xmlPath: tempCharaXmlPath,
      layoutXmlPath: tempLayoutXmlPath,
    });
    await runParamXmlDisassemble(prcPath, tempCharaXmlPath);
    await runParamXmlDisassemble(layoutPrcPath, tempLayoutXmlPath);
    charaJson = charaXmlToJson(fs.readFileSync(tempCharaXmlPath, 'utf8'));
    layoutJson = charaXmlToJson(fs.readFileSync(tempLayoutXmlPath, 'utf8'));
    logCharacterCss('PRC converted with ParamXML fallback', {
      outputPath: tempCharaXmlPath,
      layoutOutputPath: tempLayoutXmlPath,
      ...collectCharacterCssDebugSnapshot(charaJson),
      layoutStructCount: getStructList(layoutJson).length,
    });
  }
  await runMsbtToJson(msgNamePath, tempMsgNameJsonPath);

  const msgNameJson = readJsonFile<any>(tempMsgNameJsonPath);
  getStructList(charaJson);
  if (!Array.isArray(msgNameJson?.strings)) {
    throw new Error('Invalid msg_name.msbt: could not read strings');
  }

  logCharacterCss('MSBT converted and source validated', {
    outputPath: tempMsgNameJsonPath,
    ...collectCharacterCssDebugSnapshot(charaJson, msgNameJson),
    layoutStructCount: getStructList(layoutJson).length,
  });

  fs.writeFileSync(
    getPersistedCharaJsonPath(),
    JSON.stringify(charaJson),
    'utf8',
  );
  fs.writeFileSync(
    getPersistedLayoutJsonPath(),
    JSON.stringify(layoutJson),
    'utf8',
  );
  fs.writeFileSync(
    getPersistedMsgNameJsonPath(),
    JSON.stringify(msgNameJson),
    'utf8',
  );
  fs.copyFileSync(msgNamePath, getPersistedMsgNamePath());
  fs.writeFileSync(
    getPersistedSourceManifestPath(),
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        sourceFiles: {
          uiCharaDbPrc: prcPath,
          uiLayoutDbPrc: layoutPrcPath,
          msgNameMsbt: msgNamePath,
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    success: true as const,
    sourcePaths: {
      prcPath,
      layoutPrcPath,
      msgNamePath,
    },
    ...getCharacterCssLayoutData(),
  };
}

function ensureCharacterModMetadata(modRootPath: string) {
  const infoTomlPath = path.join(modRootPath, 'info.toml');

  if (!fs.existsSync(infoTomlPath)) {
    fs.writeFileSync(
      infoTomlPath,
      [
        'display_name = "Character CSS Layout"',
        'version = "1.0.0"',
        'category = "ui"',
        'description = """',
        'Generated by the FightPlanner Characters tab.',
        '"""',
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

export function getCharacterCssLayoutData(): CharacterCssLayoutData {
  const currentChara = readCurrentCharaJson();
  const msgNameJson = readCurrentMsgNameJson();
  const entries = getStructList(currentChara.json).map((entry) =>
    buildCharacterEntry(entry, msgNameJson),
  );

  const rootEntries = entries.filter((entry) => !entry.groupId);
  const visibleCharacters = rootEntries
    .filter((entry) => !entry.hidden)
    .sort((left, right) => left.order - right.order);
  const hiddenCharacters = rootEntries
    .filter((entry) => entry.hidden)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const groups = entries
    .filter((entry) => entry.groupId)
    .reduce<Record<string, CharacterCssEntry[]>>((result, entry) => {
      const groupId = entry.groupId!;
      (result[groupId] ||= []).push(entry);
      return result;
    }, {});
  entries
    .filter((entry) => entry.isGroup)
    .forEach((entry) => {
      groups[entry.id] ||= [];
    });
  Object.values(groups).forEach((characters) => {
    characters.sort((left, right) => left.order - right.order);
  });

  logCharacterCss('Layout data built', {
    source: currentChara.source,
    total: entries.length,
    visible: visibleCharacters.length,
    hidden: hiddenCharacters.length,
    groups: Object.keys(groups).length,
    missingOrder: entries.filter((entry) => Number.isNaN(entry.order)).length,
    sample: entries.slice(0, 5).map((entry) => ({
      id: entry.id,
      nameId: entry.nameId,
      displayName: entry.displayName,
      order: entry.order,
      hidden: entry.hidden,
      canSelect: entry.canSelect,
    })),
  });

  return {
    source: currentChara.source,
    visibleCharacters,
    hiddenCharacters,
    groups,
  };
}

export function duplicateCharacterCssEntry(
  payload: DuplicateCharacterCssPayload,
) {
  const newUiCharaId = payload.newUiCharaId.trim();
  if (!newUiCharaId || !newUiCharaId.startsWith('ui_chara_')) {
    throw new Error('The new Character ID must start with ui_chara_');
  }

  const currentChara = readCurrentCharaJson();
  const charaJson = clone(currentChara.json);
  const layoutJson = clone(readCurrentLayoutJson());
  const msgNameJson = clone(readCurrentMsgNameJson());
  const structs = getStructList(charaJson);
  const layoutStructs = getStructList(layoutJson);
  const sourceIndex = structs.findIndex(
    (entry) =>
      getHashText(entry, 'hash40', 'ui_chara_id', '') ===
      payload.sourceCharacterId,
  );

  if (sourceIndex < 0) {
    throw new Error(`Character not found: ${payload.sourceCharacterId}`);
  }

  if (
    structs.some(
      (entry) =>
        getHashText(entry, 'hash40', 'ui_chara_id', '') === newUiCharaId,
    )
  ) {
    throw new Error(`Character ID already exists: ${newUiCharaId}`);
  }

  const sourceEntry = structs[sourceIndex];
  const sourceNameId = String(sourceEntry?.string?.['#text'] || '');
  const newNameId =
    payload.newNameId?.trim() || newUiCharaId.replace(/^ui_chara_/, '').trim();

  if (!newNameId) {
    throw new Error('The new Name ID cannot be empty');
  }

  const duplicatedEntry = clone(sourceEntry);
  duplicatedEntry['@index'] = String(structs.length);
  setHashText(duplicatedEntry, 'hash40', 'ui_chara_id', newUiCharaId);
  setHashText(
    duplicatedEntry,
    'hash40',
    'fighter_type',
    'fighter_type_normal',
  );
  setHashText(
    duplicatedEntry,
    'hash40',
    'alt_chara_id',
    '0x02302d482a',
  );
  duplicatedEntry.string['#text'] = newNameId;
  const duplicatedOrder = getCharacterCssSbyteOrder(structs.length);
  setHashTextIfPresent(
    duplicatedEntry,
    'sbyte',
    'skill_list_order',
    duplicatedOrder,
  );
  setHashText(duplicatedEntry, 'sbyte', 'disp_order', duplicatedOrder);
  setHashTextIfPresent(duplicatedEntry, 'bool', 'is_dlc', 'False');
  setHashTextIfPresent(duplicatedEntry, 'bool', 'is_patch', 'False');
  ensureHashText(
    duplicatedEntry,
    'hash40',
    'original_ui_chara_hash',
    payload.sourceCharacterId,
  );

  structs.push(duplicatedEntry);
  charaJson.struct.list.struct = structs;
  if (charaJson.struct.list['@size']) {
    charaJson.struct.list['@size'] = String(structs.length);
  }

  const duplicatedLayoutEntries = layoutStructs
    .filter(
      (entry) =>
        getHashText(entry, 'hash40', 'ui_chara_id', '') ===
        payload.sourceCharacterId,
    )
    .map((entry) => {
      const nextEntry = clone(entry);
      setHashText(nextEntry, 'hash40', 'ui_chara_id', newUiCharaId);
      const layoutId = getHashText(nextEntry, 'hash40', 'ui_layout_id', '');
      if (layoutId) {
        setHashText(
          nextEntry,
          'hash40',
          'ui_layout_id',
          layoutId.replace(payload.sourceCharacterId, newUiCharaId),
        );
      }
      return nextEntry;
    });

  if (duplicatedLayoutEntries.length > 0) {
    layoutJson.struct.list.struct = [
      ...layoutStructs,
      ...duplicatedLayoutEntries,
    ].map((entry, index) => ({
      ...entry,
      '@index': String(index),
    }));
    if (layoutJson.struct.list['@size']) {
      layoutJson.struct.list['@size'] = String(
        layoutJson.struct.list.struct.length,
      );
    }
  }

  duplicateNameLabels(
    msgNameJson,
    sourceNameId,
    newNameId,
    payload.newDisplayName,
  );
  writePersistedCharacterCssData(charaJson, msgNameJson, layoutJson);

  return getCharacterCssLayoutData();
}

export async function createEchoSlot(payload: CreateEchoSlotPayload) {
  const newNameId = payload.newNameId.trim().toLowerCase();
  const modPath = payload.modPath.trim();
  if (!/^[a-z0-9_]+$/.test(newNameId)) {
    throw new Error(
      'Name ID only accepts lowercase letters, numbers and underscores',
    );
  }
  if (
    !Number.isInteger(payload.colorCount) ||
    payload.colorCount < 1 ||
    payload.colorCount > 8
  ) {
    throw new Error('Color count must be between 1 and 8');
  }
  if (
    !Number.isInteger(payload.colorStartIndex) ||
    payload.colorStartIndex < 0 ||
    payload.colorStartIndex > 255
  ) {
    throw new Error('Color start index must be between 0 and 255');
  }
  if (!fs.existsSync(modPath) || !fs.statSync(modPath).isDirectory()) {
    throw new Error('Select an existing mod folder');
  }

  const modsPath = store.get('modsPath') as string | null;
  if (!modsPath || !fs.existsSync(modsPath)) {
    throw new Error('Configure an existing mods folder before creating an Echo');
  }

  const sourceEntry = [
    ...getCharacterCssLayoutData().visibleCharacters,
    ...getCharacterCssLayoutData().hiddenCharacters,
  ].find((entry) => entry.id === payload.sourceCharacterId);
  if (!sourceEntry) {
    throw new Error(`Character not found: ${payload.sourceCharacterId}`);
  }

  const fighterDir = path.join(modPath, 'fighter', sourceEntry.nameId);
  if (!fs.existsSync(fighterDir)) {
    throw new Error(`Selected mod has no fighter/${sourceEntry.nameId} folder`);
  }

  const uiAssetRoots = [
    path.join(modPath, 'ui', 'replace', 'chara'),
    path.join(modPath, 'ui', 'replace_patch', 'chara'),
  ];
  const uiAssets = uiAssetRoots.flatMap(listFilesRecursive);
  const sourceAssetPattern = new RegExp(`_${sourceEntry.nameId}_`, 'i');
  if (
    !uiAssets.some((filePath) =>
      sourceAssetPattern.test(path.basename(filePath)),
    )
  ) {
    throw new Error(
      `No chara UI asset found for ${sourceEntry.nameId}. Add ui/replace/chara or ui/replace_patch/chara files first.`,
    );
  }

  const warnings: string[] = [];
  if (
    !uiAssets.some((filePath) =>
      path
        .basename(filePath)
        .toLowerCase()
        .startsWith(`chara_7_${sourceEntry.nameId.toLowerCase()}_`),
    )
  ) {
    warnings.push('Missing chara_7 asset: Echo CSS tile may be blank.');
  }
  const voiceDir = path.join(modPath, 'sound', 'bank', 'fighter_voice');
  if (
    !listFilesRecursive(voiceDir).some((filePath) =>
      /\.nus3bank$/i.test(filePath),
    )
  ) {
    warnings.push(
      'No fighter voice .nus3bank found: simultaneous base/Echo matches may share voices.',
    );
  }
  const newUiCharaId = `ui_chara_${newNameId}`;
  const newDisplayName = payload.newDisplayName.trim() || newNameId;
  const echoSlots = Array.from(
    { length: payload.colorCount },
    (_, index) =>
      `c${String(payload.colorStartIndex + index).padStart(2, '0')}`,
  );
  const scan = await ModScanner.scanModFiles(modPath);
  const sourceSlots = Object.keys(scan.pathData[sourceEntry.nameId] || {})
    .filter((slot) => /^c\d{2,3}$/.test(slot))
    .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
    .slice(0, payload.colorCount);
  if (sourceSlots.length !== payload.colorCount) {
    throw new Error(
      `Expected ${payload.colorCount} source fighter slots, found ${sourceSlots.length}: ${sourceSlots.join(', ') || 'none'}. No files were changed.`,
    );
  }

  const persistedSnapshots = captureEchoFileSnapshots([
    getPersistedCharaJsonPath(),
    getPersistedLayoutJsonPath(),
    getPersistedMsgNameJsonPath(),
    getPersistedMsgNamePath(),
  ]);
  const characterCssModPath = path.join(modsPath, 'Character CSS Layout');
  const directoryBackups: EchoDirectoryBackup[] = [];
  try {
    directoryBackups.push(await createEchoDirectoryBackup(modPath));
    if (path.resolve(characterCssModPath) !== path.resolve(modPath)) {
      directoryBackups.push(
        await createEchoDirectoryBackup(characterCssModPath),
      );
    }
  } catch (error) {
    await Promise.allSettled(directoryBackups.map(removeEchoDirectoryBackup));
    throw new Error(
      `Could not back up Echo files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const disabledUiPatches = disableConflictingEchoUiPatches(modPath);
    if (disabledUiPatches.length > 0) {
      warnings.push(
        `Disabled conflicting UI patches: ${disabledUiPatches.join(', ')}. Backups are in .fightplanner-echo-backup.`,
      );
    }

    duplicateCharacterCssEntry({
      sourceCharacterId: payload.sourceCharacterId,
      newUiCharaId,
      newNameId,
      newDisplayName,
    });

    const currentLayout = getCharacterCssLayoutData();
    const layoutPayload: CharacterCssLayoutPayload = {
      visibleCharacterIds: currentLayout.visibleCharacters.map(
        (entry) => entry.id,
      ),
      hiddenCharacterIds: currentLayout.hiddenCharacters.map(
        (entry) => entry.id,
      ),
      characterUpdates: {
        [payload.sourceCharacterId]: {
          fighterType: 'fighter_type_both',
          altCharaId: newUiCharaId,
        },
        [newUiCharaId]: {
          fighterType: 'fighter_type_opened',
          altCharaId: payload.sourceCharacterId,
          colorNum: String(payload.colorCount),
          colorStartIndex: String(payload.colorStartIndex),
          slots: Object.fromEntries(
            Array.from({ length: payload.colorCount }, (_, index) => [
              String(index),
              {
                cxxIndex: String(index),
                nxxIndex: String(index),
                characallLabel: sourceEntry.slots[0]?.characallLabel || '',
                namChr0: newDisplayName,
                namChr1: newDisplayName,
                namChr2: newDisplayName.toUpperCase(),
                namChr3: newDisplayName.toUpperCase(),
                namStageName: newDisplayName,
              },
            ]),
          ),
        },
      },
    };
    await saveCharacterCssLayout(layoutPayload);

    backupEchoConfig(modPath);
    const existingConfigPath = path.join(modPath, 'config.json');
    const existingConfig = fs.existsSync(existingConfigPath)
      ? readJsonFile(existingConfigPath)
      : {};
    await SlotChanger.changeSlots(
      modPath,
      new Map([
        [
          sourceEntry.nameId,
          new Map(
            sourceSlots.map((sourceSlot, index) => [
              sourceSlot,
              echoSlots[index],
            ]),
          ),
        ],
      ]),
      scan.pathData,
      {},
      false,
    );

    renameEchoUiAssets(
      path.join(modPath, 'ui', 'replace', 'chara'),
      sourceEntry.nameId,
      newNameId,
    );
    renameEchoUiAssets(
      path.join(modPath, 'ui', 'replace_patch', 'chara'),
      sourceEntry.nameId,
      newNameId,
    );

    await ConfigGenerator.init();
    const configGenerator = new ConfigGenerator(modPath, sourceEntry.nameId);
    await configGenerator.generateCskConfig(
      echoSlots.map((targetSlot, index) => ({
        sourceSlot: payload.useTwoBaseModels && index % 2 === 1 ? 'c01' : 'c00',
        targetSlot,
      })),
    );
    const generatedConfig = readJsonFile(existingConfigPath);
    fs.writeFileSync(
      existingConfigPath,
      JSON.stringify(mergeEchoConfig(generatedConfig, existingConfig), null, 2),
      'utf8',
    );
  } catch (error) {
    const restoreErrors: string[] = [];
    for (const backup of [...directoryBackups].reverse()) {
      try {
        await restoreEchoDirectoryBackup(backup);
      } catch (restoreError) {
        restoreErrors.push(
          `${backup.originalPath}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        );
      }
    }
    try {
      restoreEchoFileSnapshots(persistedSnapshots);
    } catch (restoreError) {
      restoreErrors.push(
        `CSS data: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
      );
    }

    if (restoreErrors.length > 0) {
      throw new Error(
        `Echo creation failed and automatic restore was incomplete. ${restoreErrors.join(' | ')}. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw new Error(
      `Echo creation failed; all changed files were restored: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const backup of directoryBackups) {
    try {
      await removeEchoDirectoryBackup(backup);
    } catch (error) {
      warnings.push(
        `Echo created, but temporary backup cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { success: true as const, newUiCharaId, modPath, warnings };
}

export async function removeEchoSlot(payload: RemoveEchoSlotPayload) {
  const characterId = payload.characterId.trim();

  const charaJson = clone(readCurrentCharaJson().json);
  const layoutJson = clone(readCurrentLayoutJson());
  const msgNameJson = clone(readCurrentMsgNameJson());
  const structs = getStructList(charaJson);
  const echo = structs.find(
    (entry) => getHashText(entry, 'hash40', 'ui_chara_id', '') === characterId,
  );
  if (
    !echo ||
    getHashText(echo, 'hash40', 'fighter_type', '') !== 'fighter_type_opened'
  ) {
    throw new Error('Selected character is not a secondary Echo');
  }

  const altBaseId = getHashText(echo, 'hash40', 'alt_chara_id', '');
  const originalBaseId = getHashText(
    echo,
    'hash40',
    'original_ui_chara_hash',
    '',
  );
  const baseIds = [altBaseId, originalBaseId].filter(
    (baseId) => baseId && baseId !== '0x02302d482a',
  );
  const base =
    structs.find((entry) =>
      baseIds.includes(getHashText(entry, 'hash40', 'ui_chara_id', '')),
    ) ||
    structs.find(
      (entry) =>
        getHashText(entry, 'hash40', 'alt_chara_id', '') === characterId &&
        getHashText(entry, 'hash40', 'fighter_type', '') ===
          'fighter_type_both',
    );
  if (!base) {
    throw new Error(
      `Base fighter not found for ${characterId} (alt: ${altBaseId || 'missing'}, original: ${originalBaseId || 'missing'})`,
    );
  }

  const echoNameId = String(echo?.string?.['#text'] || '');
  const baseNameId = String(base?.string?.['#text'] || '');
  const colorCount = Number(getHashText(echo, 'byte', 'color_num', '0'));
  const colorStart = Number(
    getHashText(echo, 'byte', 'color_start_index', '0'),
  );
  const echoSlots = Array.from(
    { length: colorCount },
    (_, index) => `c${String(colorStart + index).padStart(2, '0')}`,
  );
  const originalSlots = Array.from(
    { length: colorCount },
    (_, index) => `c${String(index).padStart(2, '0')}`,
  );
  const requestedModPath = payload.modPath?.trim();
  const modPath =
    requestedModPath && fs.existsSync(requestedModPath)
      ? requestedModPath
      : detectEchoModPath(baseNameId, echoNameId, echoSlots);
  const warnings: string[] = [];

  if (modPath) {
    const scan = await ModScanner.scanModFiles(modPath);
    const availableEchoSlots = echoSlots.filter(
      (slot) => scan.pathData[baseNameId]?.[slot],
    );
    if (availableEchoSlots.length > 0) {
      await SlotChanger.changeSlots(
        modPath,
        new Map([
          [
            baseNameId,
            new Map(
              availableEchoSlots.map((slot) => [
                slot,
                originalSlots[echoSlots.indexOf(slot)],
              ]),
            ),
          ],
        ]),
        scan.pathData,
        {},
        false,
      );
    }

    renameEchoUiAssets(
      path.join(modPath, 'ui', 'replace', 'chara'),
      echoNameId,
      baseNameId,
    );
    renameEchoUiAssets(
      path.join(modPath, 'ui', 'replace_patch', 'chara'),
      echoNameId,
      baseNameId,
    );
    restoreEchoBackups(modPath);
  } else {
    warnings.push(
      'Echo mod folder not found. CSS/MSBT entry removed; file rollback skipped.',
    );
  }

  setHashText(base, 'hash40', 'fighter_type', 'fighter_type_normal');
  setHashText(base, 'hash40', 'alt_chara_id', '0x02302d482a');
  const nextStructs = structs.filter((entry) => entry !== echo);
  nextStructs.forEach((entry, index) => {
    entry['@index'] = String(index);
  });
  charaJson.struct.list.struct = nextStructs;
  if (charaJson.struct.list['@size'])
    charaJson.struct.list['@size'] = String(nextStructs.length);

  layoutJson.struct.list.struct = getStructList(layoutJson)
    .filter(
      (entry) =>
        getHashText(entry, 'hash40', 'ui_chara_id', '') !== characterId,
    )
    .map((entry, index) => ({ ...entry, '@index': String(index) }));
  if (layoutJson.struct.list['@size']) {
    layoutJson.struct.list['@size'] = String(
      layoutJson.struct.list.struct.length,
    );
  }
  if (msgNameJson.added_labels) {
    Object.keys(msgNameJson.added_labels).forEach((label) => {
      if (
        label.endsWith(`_${echoNameId}`) ||
        label.includes(`_${echoNameId}_`)
      ) {
        delete msgNameJson.added_labels[label];
      }
    });
  }

  writePersistedCharacterCssData(charaJson, msgNameJson, layoutJson);
  const current = getCharacterCssLayoutData();
  await saveCharacterCssLayout({
    visibleCharacterIds: current.visibleCharacters.map((entry) => entry.id),
    hiddenCharacterIds: current.hiddenCharacters.map((entry) => entry.id),
  });
  return {
    success: true as const,
    ...getCharacterCssLayoutData(),
    modPath,
    warnings,
  };
}

export function removeCharacterCssEntry(payload: RemoveCharacterCssPayload) {
  const characterId = payload.characterId.trim();
  if (!characterId) {
    throw new Error('Character ID cannot be empty');
  }

  const charaJson = clone(readCurrentCharaJson().json);
  const layoutJson = clone(readCurrentLayoutJson());
  const msgNameJson = clone(readCurrentMsgNameJson());
  const structs = getStructList(charaJson);
  const nextStructs = structs.filter(
    (entry) => getHashText(entry, 'hash40', 'ui_chara_id', '') !== characterId,
  );

  if (nextStructs.length === structs.length) {
    throw new Error(`Character not found: ${characterId}`);
  }

  nextStructs.forEach((entry, index) => {
    entry['@index'] = String(index);
  });

  charaJson.struct.list.struct = nextStructs;
  if (charaJson.struct.list['@size']) {
    charaJson.struct.list['@size'] = String(nextStructs.length);
  }

  layoutJson.struct.list.struct = getStructList(layoutJson)
    .filter(
      (entry) =>
        getHashText(entry, 'hash40', 'ui_chara_id', '') !== characterId,
    )
    .map((entry, index) => ({ ...entry, '@index': String(index) }));
  if (layoutJson.struct.list['@size']) {
    layoutJson.struct.list['@size'] = String(
      layoutJson.struct.list.struct.length,
    );
  }

  writePersistedCharacterCssData(charaJson, msgNameJson, layoutJson);
  return getCharacterCssLayoutData();
}

export async function saveCharacterCssLayout(
  payload: CharacterCssLayoutPayload,
) {
  const charaJson = clone(readCurrentCharaJson().json);
  const layoutJson = clone(readCurrentLayoutJson());
  const msgNameJson = updateMsgNameJson(
    clone(readCurrentMsgNameJson()),
    payload.renamedCharacters,
  );
  applyCreatedCharacterCssGroups(charaJson, msgNameJson, payload.createdGroups);
  applyLayoutToCharaJson(charaJson, payload);
  applyCharacterUpdates(charaJson, msgNameJson, payload.characterUpdates);

  const persistedCharaJsonPath = getPersistedCharaJsonPath();
  const persistedLayoutJsonPath = getPersistedLayoutJsonPath();
  const persistedMsgNameJsonPath = getPersistedMsgNameJsonPath();
  fs.writeFileSync(persistedCharaJsonPath, JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(persistedLayoutJsonPath, JSON.stringify(layoutJson), 'utf8');
  fs.writeFileSync(
    persistedMsgNameJsonPath,
    JSON.stringify(msgNameJson),
    'utf8',
  );

  const tempCssDir = getTempCssDir();
  const tempCharaJsonPath = path.join(tempCssDir, TEMP_CHARA_JSON_FILE);
  const tempLayoutJsonPath = path.join(tempCssDir, TEMP_LAYOUT_JSON_FILE);
  const tempCharaXmlPath = path.join(tempCssDir, TEMP_CHARA_XML_FILE);
  const tempLayoutXmlPath = path.join(tempCssDir, TEMP_LAYOUT_XML_FILE);
  const tempMsgNameJsonPath = path.join(tempCssDir, TEMP_MSG_NAME_JSON_FILE);
  const generatedMsgNamePath = path.join(tempCssDir, GENERATED_MSG_NAME_FILE);

  fs.writeFileSync(tempCharaJsonPath, JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(tempLayoutJsonPath, JSON.stringify(layoutJson), 'utf8');
  fs.writeFileSync(tempCharaXmlPath, charaJsonToParamXml(charaJson), 'utf8');
  fs.writeFileSync(tempLayoutXmlPath, charaJsonToParamXml(layoutJson), 'utf8');
  fs.writeFileSync(tempMsgNameJsonPath, JSON.stringify(msgNameJson), 'utf8');

  const charaPrcResult = await runParamXml(tempCharaXmlPath);
  const layoutPrcResult = await runParamXml(tempLayoutXmlPath);
  const generatedCharaPrcPath = charaPrcResult.outputPath;
  const generatedLayoutPrcPath = layoutPrcResult.outputPath;

  const hasMsbtChanges =
    (payload.createdGroups?.length || 0) > 0 ||
    Object.keys(payload.renamedCharacters || {}).length > 0 ||
    Object.keys(payload.characterUpdates || {}).length > 0;
  let msbtResult: ToolExecutionResult = { stdout: '', stderr: '' };

  if (fs.existsSync(generatedMsgNamePath)) {
    fs.unlinkSync(generatedMsgNamePath);
  }

  if (hasMsbtChanges) {
    const msbtToolPath = resolveMsbtEditorExecutable();
    msbtResult = await runNativeTool(msbtToolPath, [
      tempMsgNameJsonPath,
      generatedMsgNamePath,
    ]);
  } else {
    const baseMsgNamePath = getPersistedMsgNamePath();
    if (!fs.existsSync(baseMsgNamePath)) {
      throw new Error(
        'Character CSS editor requires your msg_name.msbt first. Import it from Edit CSS.',
      );
    }
    fs.copyFileSync(baseMsgNamePath, generatedMsgNamePath);
  }

  if (
    !fs.existsSync(generatedMsgNamePath) ||
    fs.statSync(generatedMsgNamePath).size === 0
  ) {
    throw new Error('MSBTEditorCLI did not generate a valid msg_name.msbt');
  }

  const modsPath = store.get('modsPath') as string | null;
  if (!modsPath) {
    throw new Error(
      'Mods folder not configured. Set your mods path before saving a character CSS layout.',
    );
  }

  if (!fs.existsSync(modsPath)) {
    throw new Error(`Configured mods folder does not exist: ${modsPath}`);
  }

  const modRoot = path.join(modsPath, 'Character CSS Layout');
  const databaseDir = path.join(modRoot, 'ui', 'param', 'database');
  const messageDir = path.join(modRoot, 'ui', 'message');
  ensureDirectory(databaseDir);
  ensureDirectory(messageDir);
  ensureCharacterModMetadata(modRoot);

  const targetCharaPrcPath = path.join(databaseDir, SOURCE_CHARA_PRC_FILE);
  const targetLayoutPrcPath = path.join(databaseDir, SOURCE_LAYOUT_PRC_FILE);
  const targetMsgNamePath = path.join(messageDir, GENERATED_MSG_NAME_FILE);
  ['ui_chara_db.prcxml', 'ui_layout_db.prcxml'].forEach(
    (obsoleteFileName) => {
      const obsoletePath = path.join(databaseDir, obsoleteFileName);
      if (fs.existsSync(obsoletePath)) {
        fs.unlinkSync(obsoletePath);
      }
    },
  );
  fs.copyFileSync(generatedCharaPrcPath, targetCharaPrcPath);
  fs.copyFileSync(generatedLayoutPrcPath, targetLayoutPrcPath);
  fs.copyFileSync(generatedMsgNamePath, targetMsgNamePath);
  fs.copyFileSync(generatedMsgNamePath, getPersistedMsgNamePath());

  return {
    success: true as const,
    source: 'saved' as const,
    persistedCharaJsonPath,
    persistedLayoutJsonPath,
    persistedMsgNameJsonPath,
    generatedCharaPrcPath,
    generatedLayoutPrcPath,
    generatedMsgNamePath,
    modCharaPrcPath: targetCharaPrcPath,
    modLayoutPrcPath: targetLayoutPrcPath,
    modMsgNamePath: targetMsgNamePath,
    stdout: [
      charaPrcResult.stdout,
      layoutPrcResult.stdout,
      msbtResult.stdout,
    ]
      .filter(Boolean)
      .join('\n'),
    stderr: [
      charaPrcResult.stderr,
      layoutPrcResult.stderr,
      msbtResult.stderr,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
