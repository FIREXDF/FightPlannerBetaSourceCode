import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { XMLParser } from 'fast-xml-parser';

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
const GENERATED_CHARA_PRC_FILE = 'ui_chara_db.prc';
const GENERATED_LAYOUT_PRC_FILE = 'ui_layout_db.prc';
const GENERATED_MSG_NAME_FILE = 'msg_name.msbt';
const TEMP_FILE_SUFFIX = '_modified';
let paramLabelMapCache: Map<string, string> | null = null;

const PARAM_XML_TAG_BY_COLLECTION: Record<string, string> = {
  hash40: 'Hash40',
  string: 'String',
  short: 'I16',
  int: 'I32',
  sbyte: 'I8',
  bool: 'Bool',
  byte: 'U8',
  float: 'F32',
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
}

export interface CharacterCssLayoutPayload {
  visibleCharacterIds: string[];
  hiddenCharacterIds: string[];
  renamedCharacters?: Record<string, string>;
  characterUpdates?: Record<string, CharacterCssUpdate>;
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

function scalarParamToXml(type: string, entry: any, fallbackIndex: number) {
  const xmlTag = PARAM_XML_TAG_BY_COLLECTION[type] || type;
  const hash = toHash40(String(entry?.['@hash'] ?? fallbackIndex));
  const textValue = String(entry?.['#text'] ?? '');
  const value = type === 'hash40' ? toHash40(textValue) : textValue;
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
  if (index >= 0 && Array.isArray(entry?.[collection]) && entry[collection][index]) {
    entry[collection][index]['#text'] = String(value);
  }
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

function getMsgValue(msgNameJson: any, label: string) {
  const entry = createMsgNameMap(msgNameJson).get(label);
  return typeof entry?.value === 'string' ? denormalizeMsgValue(entry.value) : '';
}

function setMsgValue(msgNameJson: any, label: string, value: string) {
  const msgMap = createMsgNameMap(msgNameJson);
  const normalizedValue = normalizeMsgValue(value);
  const entry = msgMap.get(label);

  if (entry) {
    entry.value = normalizedValue;
    return;
  }

  if (!Array.isArray(msgNameJson.strings)) {
    msgNameJson.strings = [];
  }

  msgNameJson.strings.push({
    label,
    value: normalizedValue,
  });
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
      characallLabel: getHashText(entry, 'hash40', `characall_label_c${nxxKey}`, ''),
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
    slots: buildCharacterSlots(entry, msgNameJson),
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
  fs.writeFileSync(getPersistedCharaJsonPath(), JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(getPersistedMsgNameJsonPath(), JSON.stringify(msgNameJson), 'utf8');
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
  const allIds = new Set(
    getStructList(charaJson).map((entry) =>
      getHashText(entry, 'hash40', 'ui_chara_id', ''),
    ),
  );
  const orderedIds = [
    ...(payload.visibleCharacterIds || []),
    ...(payload.hiddenCharacterIds || []),
  ];

  if (orderedIds.length !== allIds.size) {
    throw new Error(
      `Expected ${allIds.size} characters, received ${orderedIds.length}`,
    );
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error(
      'Duplicate character identifiers detected in the CSS payload',
    );
  }

  const invalidIds = orderedIds.filter((id) => !allIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(
      `Unknown character identifiers received: ${invalidIds.join(', ')}`,
    );
  }
}

function updateMsgNameJson(
  msgNameJson: any,
  renamedCharacters: Record<string, string> | undefined,
) {
  if (!renamedCharacters || Object.keys(renamedCharacters).length === 0) {
    return msgNameJson;
  }

  const msgMap = createMsgNameMap(msgNameJson);
  for (const [nameId, displayName] of Object.entries(renamedCharacters)) {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      continue;
    }

    const label = `nam_chr1_00_${nameId}`;
    const entry = msgMap.get(label);
    if (entry) {
      entry.value = normalizeMsgValue(trimmedName);
    }
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
  const existingLabels = new Set(
    sourceStrings
      .map((entry) => entry?.label)
      .filter((label): label is string => typeof label === 'string'),
  );
  const newEntries: any[] = [];

  for (const entry of sourceStrings) {
    const label = String(entry?.label || '');
    if (
      !label.endsWith(`_${sourceNameId}`) &&
      !label.includes(`_${sourceNameId}_`)
    ) {
      continue;
    }

    const newLabel = label.replace(sourceNameId, newNameId);
    if (existingLabels.has(newLabel)) {
      continue;
    }

    newEntries.push({
      ...entry,
      label: newLabel,
    });
    existingLabels.add(newLabel);
  }

  if (newEntries.length > 0) {
    msgNameJson.strings.push(...newEntries);
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
      ensureHashText(entry, 'byte', 'color_start_index', update.colorStartIndex);
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
      setHashTextIfPresent(entry, 'bool', 'is_mii', update.isMii ? 'True' : 'False');
    }
    if (typeof update.isBoss === 'boolean') {
      setHashTextIfPresent(entry, 'bool', 'is_boss', update.isBoss ? 'True' : 'False');
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

  const entryById = new Map(
    getStructList(charaJson).map(
      (entry) =>
        [getHashText(entry, 'hash40', 'ui_chara_id', ''), entry] as const,
    ),
  );
  const nextEntries: any[] = [];

  payload.visibleCharacterIds.forEach((id, index) => {
    const entry = entryById.get(id);
    if (!entry) {
      return;
    }

    setHashText(entry, 'sbyte', 'disp_order', index);
    setHashTextIfPresent(entry, 'sbyte', 'disp_order_series', index);
    setHashTextIfPresent(
      entry,
      'bool',
      'can_select',
      entry?.string?.['#text'] === 'random' ? 'False' : 'True',
    );
    nextEntries.push(entry);
  });

  payload.hiddenCharacterIds.forEach((id) => {
    const entry = entryById.get(id);
    if (!entry) {
      return;
    }

    setHashText(entry, 'sbyte', 'disp_order', -1);
    setHashTextIfPresent(entry, 'bool', 'can_select', 'False');
    nextEntries.push(entry);
  });

  charaJson.struct.list.struct = nextEntries;
  return charaJson;
}

function getParamXmlOutputCandidates(inputXmlPath: string) {
  const workingDirectory = path.dirname(inputXmlPath);
  const baseName = path.basename(inputXmlPath, path.extname(inputXmlPath));
  const candidates = [`${baseName}.prc`];

  if (baseName.endsWith(TEMP_FILE_SUFFIX)) {
    candidates.push(`${baseName.slice(0, -TEMP_FILE_SUFFIX.length)}.prc`);
  }

  return [...new Set(candidates)].map((fileName) =>
    path.join(workingDirectory, fileName),
  );
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

  if (process.platform !== 'win32') {
    fs.chmodSync(executablePath, 0o755);
  }

  return executablePath;
}

function runParamXml(inputXmlPath: string) {
  const executablePath = resolveParamXmlExecutable();
  const workingDirectory = path.dirname(inputXmlPath);
  const outputCandidates = getParamXmlOutputCandidates(inputXmlPath);

  outputCandidates.forEach((outputPath) => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  return new Promise<ToolExecutionResult & { outputPath: string }>((resolve, reject) => {
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

      const outputPath = outputCandidates.find((candidate) =>
        fs.existsSync(candidate),
      );
      if (!outputPath) {
        reject(
          new Error(
            `ParamXML completed but did not generate ${outputCandidates.map((candidate) => path.basename(candidate)).join(' or ')}`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr, outputPath });
    });
  });
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

  return new Promise<ToolExecutionResult & { outputPath: string }>((resolve, reject) => {
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
        reject(new Error('ParamXML completed but did not generate XML output'));
        return;
      }

      resolve({ stdout, stderr, outputPath: outputXmlPath });
    });
  });
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

  if (process.platform !== 'win32') {
    fs.chmodSync(executablePath, 0o755);
  }

  return executablePath;
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

  try {
    return await runNativeTool(resolveMsbtEditorExecutable(), [
      inputMsbtPath,
      outputJsonPath,
    ]);
  } catch (error) {
    const msbtToolPath = resolveToolsPath('MSBTEditorCLI', 'MSBTEditorCli.dll');
    return runDotnetTool(msbtToolPath, [inputMsbtPath, outputJsonPath]);
  }
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

  if (!prcPath || path.basename(prcPath) !== GENERATED_CHARA_PRC_FILE) {
    throw new Error(`Select ${GENERATED_CHARA_PRC_FILE}`);
  }
  if (
    !layoutPrcPath ||
    path.basename(layoutPrcPath) !== GENERATED_LAYOUT_PRC_FILE
  ) {
    throw new Error(`Select ${GENERATED_LAYOUT_PRC_FILE}`);
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

  const visibleCharacters = entries
    .filter((entry) => !entry.hidden)
    .sort((left, right) => left.order - right.order);
  const hiddenCharacters = entries
    .filter((entry) => entry.hidden)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  logCharacterCss('Layout data built', {
    source: currentChara.source,
    total: entries.length,
    visible: visibleCharacters.length,
    hidden: hiddenCharacters.length,
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
  };
}

export function duplicateCharacterCssEntry(payload: DuplicateCharacterCssPayload) {
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
      (entry) => getHashText(entry, 'hash40', 'ui_chara_id', '') === newUiCharaId,
    )
  ) {
    throw new Error(`Character ID already exists: ${newUiCharaId}`);
  }

  const sourceEntry = structs[sourceIndex];
  const sourceNameId = String(sourceEntry?.string?.['#text'] || '');
  const newNameId =
    payload.newNameId?.trim() ||
    newUiCharaId.replace(/^ui_chara_/, '').trim();

  if (!newNameId) {
    throw new Error('The new Name ID cannot be empty');
  }

  const duplicatedEntry = clone(sourceEntry);
  duplicatedEntry['@index'] = String(structs.length);
  setHashText(duplicatedEntry, 'hash40', 'ui_chara_id', newUiCharaId);
  duplicatedEntry.string['#text'] = newNameId;
  setHashText(duplicatedEntry, 'sbyte', 'disp_order', structs.length);
  setHashTextIfPresent(duplicatedEntry, 'sbyte', 'disp_order_series', structs.length);
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

  writePersistedCharacterCssData(charaJson, msgNameJson, layoutJson);
  return getCharacterCssLayoutData();
}

export async function saveCharacterCssLayout(
  payload: CharacterCssLayoutPayload,
) {
  const charaJson = applyLayoutToCharaJson(
    clone(readCurrentCharaJson().json),
    payload,
  );
  const layoutJson = clone(readCurrentLayoutJson());
  const msgNameJson = updateMsgNameJson(
    clone(readCurrentMsgNameJson()),
    payload.renamedCharacters,
  );
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

  const prcResult = await runParamXml(tempCharaXmlPath);
  const generatedCharaPrcPath = prcResult.outputPath;
  const layoutPrcResult = await runParamXml(tempLayoutXmlPath);
  const generatedLayoutPrcPath = layoutPrcResult.outputPath;

  const hasMsbtChanges =
    Object.keys(payload.renamedCharacters || {}).length > 0 ||
    Object.values(payload.characterUpdates || {}).some(
      (update) => Object.keys(update.slots || {}).length > 0,
    );
  let msbtResult: ToolExecutionResult = { stdout: '', stderr: '' };

  if (hasMsbtChanges) {
    try {
      msbtResult = await runNativeTool(resolveMsbtEditorExecutable(), [
        tempMsgNameJsonPath,
        generatedMsgNamePath,
      ]);
    } catch (error) {
      try {
        const msbtToolPath = resolveToolsPath(
          'MSBTEditorCLI',
          'MSBTEditorCli.dll',
        );
        msbtResult = await runDotnetTool(msbtToolPath, [
          tempMsgNameJsonPath,
          generatedMsgNamePath,
        ]);
      } catch (fallbackError) {
        const baseMsgNamePath = getPersistedMsgNamePath();
        if (!fs.existsSync(baseMsgNamePath)) {
          throw new Error(
            'Character CSS editor requires your msg_name.msbt first. Import it from Edit CSS.',
          );
        }
        fs.copyFileSync(baseMsgNamePath, generatedMsgNamePath);
        msbtResult = {
          stdout: '',
          stderr: `MSBT changes were saved in FightPlanner data, but msg_name.msbt was not regenerated. Native MSBTEditorCLI failed: ${error instanceof Error ? error.message : String(error)}. dotnet fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}.`,
        };
      }
    }
  } else {
    const baseMsgNamePath = getPersistedMsgNamePath();
    if (!fs.existsSync(baseMsgNamePath)) {
      throw new Error(
        'Character CSS editor requires your msg_name.msbt first. Import it from Edit CSS.',
      );
    }
    fs.copyFileSync(baseMsgNamePath, generatedMsgNamePath);
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

  const targetCharaPrcPath = path.join(databaseDir, GENERATED_CHARA_PRC_FILE);
  const targetLayoutPrcPath = path.join(databaseDir, GENERATED_LAYOUT_PRC_FILE);
  const targetMsgNamePath = path.join(messageDir, GENERATED_MSG_NAME_FILE);
  fs.copyFileSync(generatedCharaPrcPath, targetCharaPrcPath);
  fs.copyFileSync(generatedLayoutPrcPath, targetLayoutPrcPath);
  fs.copyFileSync(generatedMsgNamePath, targetMsgNamePath);

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
    stdout: [prcResult.stdout, layoutPrcResult.stdout, msbtResult.stdout]
      .filter(Boolean)
      .join('\n'),
    stderr: [prcResult.stderr, layoutPrcResult.stderr, msbtResult.stderr]
      .filter(Boolean)
      .join('\n'),
  };
}
