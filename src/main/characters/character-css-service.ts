import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { XMLParser } from 'fast-xml-parser';

import store from '../store';

const PERSISTED_CHARA_JSON_FILE = 'ui_chara_css_layout.json';
const PERSISTED_MSG_NAME_JSON_FILE = 'msg_name_css_layout.json';
const PERSISTED_MSG_NAME_FILE = 'msg_name_css_layout.msbt';
const PERSISTED_SOURCE_MANIFEST_FILE = 'character-css-source.json';
const TEMP_CHARA_JSON_FILE = 'ui_chara_db.json';
const TEMP_CHARA_XML_FILE = 'ui_chara_db.xml';
const TEMP_MSG_NAME_JSON_FILE = 'msg_name.json';
const GENERATED_CHARA_PRC_FILE = 'ui_chara_db.prc';
const GENERATED_MSG_NAME_FILE = 'msg_name.msbt';
const TEMP_FILE_SUFFIX = '_modified';

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
    fs.existsSync(getPersistedMsgNameJsonPath()) &&
    fs.existsSync(getPersistedMsgNamePath())
  );
}

function requireImportedCharacterCssSource() {
  if (hasImportedCharacterCssSource()) {
    return;
  }

  throw new Error(
    'Character CSS editor requires your ui_chara_db.prc and msg_name.msbt first. Import them from Edit CSS.',
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
  const hash = toHash40(String(entry?.['@hash'] ?? fallbackIndex));
  const textValue = String(entry?.['#text'] ?? '');
  const value = type === 'hash40' ? toHash40(textValue) : textValue;
  return `<${type} hash="${hash}">${escapeXml(value)}</${type}>`;
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

function normalizeCharaParamJson(charaJson: any) {
  const structs = asArray(charaJson?.struct?.list?.struct);
  if (!charaJson?.struct?.list || structs.length === 0) {
    throw new Error('Invalid ui_chara_db.prc: missing character structs');
  }

  structs.forEach((entry: any, index) => {
    entry['@index'] = String(entry['@index'] ?? index);
    ['hash40', 'int', 'sbyte', 'bool', 'byte'].forEach((key) => {
      entry[key] = asArray(entry[key]);
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

  return entries.findIndex((entry) => entry?.['@hash'] === hash);
}

function getHashText(
  entry: any,
  collection: string,
  hash: string,
  fallback = '',
) {
  const index = findHashIndex(entry?.[collection], hash);
  return index >= 0
    ? String(entry[collection][index]?.['#text'] ?? fallback)
    : fallback;
}

function setHashText(
  entry: any,
  collection: string,
  hash: string,
  value: string | number | boolean,
) {
  const index = findHashIndex(entry?.[collection], hash);
  if (index < 0) {
    throw new Error(
      `Missing ${collection} field "${hash}" for ${entry?.string?.['#text'] || 'character'}`,
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
  const index = findHashIndex(entry?.[collection], hash);
  if (index >= 0) {
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

  const index = findHashIndex(entry[collection], hash);
  if (index >= 0) {
    entry[collection][index]['#text'] = String(value);
    return;
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

function readCurrentCharaJson() {
  requireImportedCharacterCssSource();

  const persistedPath = getPersistedCharaJsonPath();
  if (fs.existsSync(persistedPath)) {
    return {
      source: 'saved' as const,
      json: readJsonFile<any>(persistedPath),
    };
  }

  return {
    source: 'canonical' as const,
    json: (() => {
      throw new Error('Character CSS source missing');
    })(),
  };
}

function readCurrentMsgNameJson() {
  requireImportedCharacterCssSource();

  const persistedPath = getPersistedMsgNameJsonPath();
  if (fs.existsSync(persistedPath)) {
    return readJsonFile<any>(persistedPath);
  }

  throw new Error('Character CSS source missing');
}

function writePersistedCharacterCssData(charaJson: any, msgNameJson: any) {
  fs.writeFileSync(getPersistedCharaJsonPath(), JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(getPersistedMsgNameJsonPath(), JSON.stringify(msgNameJson), 'utf8');
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

  return new Promise<ToolExecutionResult & { outputPath: string }>((resolve, reject) => {
    const child = spawn(executablePath, ['-d', inputPrcPath, '-o', outputXmlPath], {
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

export async function importCharacterCssSourceFiles(
  payload: CharacterCssSourceImportPayload,
) {
  const prcPath = payload.prcPath?.trim();
  const msgNamePath = payload.msgNamePath?.trim();

  if (!prcPath || path.basename(prcPath) !== GENERATED_CHARA_PRC_FILE) {
    throw new Error(`Select ${GENERATED_CHARA_PRC_FILE}`);
  }
  if (!msgNamePath || path.basename(msgNamePath) !== GENERATED_MSG_NAME_FILE) {
    throw new Error(`Select ${GENERATED_MSG_NAME_FILE}`);
  }
  if (!fs.existsSync(prcPath)) {
    throw new Error(`Character PRC not found: ${prcPath}`);
  }
  if (!fs.existsSync(msgNamePath)) {
    throw new Error(`MSBT not found: ${msgNamePath}`);
  }

  const tempCssDir = getTempCssDir();
  const tempCharaXmlPath = path.join(tempCssDir, 'ui_chara_db_source.xml');
  const tempMsgNameJsonPath = path.join(tempCssDir, TEMP_MSG_NAME_JSON_FILE);

  await runParamXmlDisassemble(prcPath, tempCharaXmlPath);
  await runMsbtToJson(msgNamePath, tempMsgNameJsonPath);

  const charaJson = charaXmlToJson(fs.readFileSync(tempCharaXmlPath, 'utf8'));
  const msgNameJson = readJsonFile<any>(tempMsgNameJsonPath);
  getStructList(charaJson);
  if (!Array.isArray(msgNameJson?.strings)) {
    throw new Error('Invalid msg_name.msbt: could not read strings');
  }

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
  fs.copyFileSync(msgNamePath, getPersistedMsgNamePath());
  fs.writeFileSync(
    getPersistedSourceManifestPath(),
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        sourceFiles: {
          uiCharaDbPrc: prcPath,
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
  const msgNameJson = clone(readCurrentMsgNameJson());
  const structs = getStructList(charaJson);
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

  duplicateNameLabels(
    msgNameJson,
    sourceNameId,
    newNameId,
    payload.newDisplayName,
  );
  writePersistedCharacterCssData(charaJson, msgNameJson);

  return getCharacterCssLayoutData();
}

export function removeCharacterCssEntry(payload: RemoveCharacterCssPayload) {
  const characterId = payload.characterId.trim();
  if (!characterId) {
    throw new Error('Character ID cannot be empty');
  }

  const charaJson = clone(readCurrentCharaJson().json);
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

  writePersistedCharacterCssData(charaJson, msgNameJson);
  return getCharacterCssLayoutData();
}

export async function saveCharacterCssLayout(
  payload: CharacterCssLayoutPayload,
) {
  const charaJson = applyLayoutToCharaJson(
    clone(readCurrentCharaJson().json),
    payload,
  );
  const msgNameJson = updateMsgNameJson(
    clone(readCurrentMsgNameJson()),
    payload.renamedCharacters,
  );
  applyCharacterUpdates(charaJson, msgNameJson, payload.characterUpdates);

  const persistedCharaJsonPath = getPersistedCharaJsonPath();
  const persistedMsgNameJsonPath = getPersistedMsgNameJsonPath();
  fs.writeFileSync(persistedCharaJsonPath, JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(
    persistedMsgNameJsonPath,
    JSON.stringify(msgNameJson),
    'utf8',
  );

  const tempCssDir = getTempCssDir();
  const tempCharaJsonPath = path.join(tempCssDir, TEMP_CHARA_JSON_FILE);
  const tempCharaXmlPath = path.join(tempCssDir, TEMP_CHARA_XML_FILE);
  const tempMsgNameJsonPath = path.join(tempCssDir, TEMP_MSG_NAME_JSON_FILE);
  const generatedMsgNamePath = path.join(tempCssDir, GENERATED_MSG_NAME_FILE);

  fs.writeFileSync(tempCharaJsonPath, JSON.stringify(charaJson), 'utf8');
  fs.writeFileSync(tempCharaXmlPath, charaJsonToParamXml(charaJson), 'utf8');
  fs.writeFileSync(tempMsgNameJsonPath, JSON.stringify(msgNameJson), 'utf8');

  const prcResult = await runParamXml(tempCharaXmlPath);
  const generatedCharaPrcPath = prcResult.outputPath;

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
  const targetMsgNamePath = path.join(messageDir, GENERATED_MSG_NAME_FILE);
  fs.copyFileSync(generatedCharaPrcPath, targetCharaPrcPath);
  fs.copyFileSync(generatedMsgNamePath, targetMsgNamePath);

  return {
    success: true as const,
    source: 'saved' as const,
    persistedCharaJsonPath,
    persistedMsgNameJsonPath,
    generatedCharaPrcPath,
    generatedMsgNamePath,
    modCharaPrcPath: targetCharaPrcPath,
    modMsgNamePath: targetMsgNamePath,
    stdout: [prcResult.stdout, msbtResult.stdout].filter(Boolean).join('\n'),
    stderr: [prcResult.stderr, msbtResult.stderr].filter(Boolean).join('\n'),
  };
}
