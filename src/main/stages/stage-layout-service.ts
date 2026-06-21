import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import store from '../store';
import { EMBEDDED_STAGE_LAYOUT } from './stage-layout-data';

const BASE_STAGE_XML_FILE = path.join('ParamXML', 'ui_stage_db.xml');
const PERSISTED_STAGE_XML_FILE = 'ui_stage_layout.xml';
const STAGE_PRESET_MANIFEST_FILE = 'stage-layout-presets.json';
const TEMP_STAGE_XML_FILE = 'ui_stage_db_modified.xml';
const GENERATED_PRC_FILE = 'ui_stage_db.prc';
const TEMP_FILE_SUFFIX = '_modified';

const STAGE_NAME_HASH = '0x0771179CD6';
const STAGE_ORDER_HASH = '0x0ACB22637C';

const FIXED_OFFSET_CELLS = 0;
const FIXED_RANDOM_CELLS = 3;
const GRID_COLUMNS = 11;
const GRID_ROWS = 11;
const EXPECTED_GRID_CELLS = GRID_COLUMNS * GRID_ROWS;

type LayoutSource = 'saved' | 'canonical' | 'preset';

export interface StageLayoutPresetSummary {
  id: string;
  name: string;
  updatedAt: string;
}

interface StageLayoutPresetRecord extends StageLayoutPresetSummary {
  visibleStageNames: string[];
  hiddenStageNames: string[];
}

interface StageLayoutPresetManifest {
  activePresetId: string | null;
  presets: StageLayoutPresetRecord[];
}

export interface StageDescriptor {
  xmlName: string;
  displayName: string;
  imageUrl: string | null;
  canonicalOrder: number;
  isRandom: boolean;
}

export interface StageLayoutOrderState {
  visibleStageNames: string[];
  hiddenStageNames: string[];
}

export interface StageLayoutData {
  source: LayoutSource;
  fixedOffsetCells: number;
  fixedRandomCells: number;
  gridColumns: number;
  gridRows: number;
  actualGridRows: number;
  overflowCells: number;
  randomStages: StageDescriptor[];
  movableStages: StageDescriptor[];
  hiddenStages: StageDescriptor[];
  activePreset: StageLayoutPresetSummary | null;
  presets: StageLayoutPresetSummary[];
  canonicalStageNames: string[];
}

interface ParamXmlExecutionResult {
  stdout: string;
  stderr: string;
  outputPath: string;
}

const EMPTY_PRESET_MANIFEST: StageLayoutPresetManifest = {
  activePresetId: null,
  presets: [],
};

function getParamXmlOutputCandidates(inputXmlPath: string) {
  const workingDirectory = path.dirname(inputXmlPath);
  const baseName = path.basename(inputXmlPath, path.extname(inputXmlPath));
  const candidates = [`${baseName}.prc`];

  if (baseName.endsWith(TEMP_FILE_SUFFIX)) {
    candidates.push(
      `${baseName.slice(0, -TEMP_FILE_SUFFIX.length)}.prc`,
    );
  }

  return [...new Set(candidates)].map((fileName) =>
    path.join(workingDirectory, fileName),
  );
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

function getPersistedLayoutPath() {
  return path.join(getPersistedDataDir(), PERSISTED_STAGE_XML_FILE);
}

function getSourceStageXmlPath() {
  return getPersistedLayoutPath();
}

function getPresetManifestPath() {
  return path.join(getPersistedDataDir(), STAGE_PRESET_MANIFEST_FILE);
}

function getTempStageDir() {
  const dirPath = path.join(app.getPath('temp'), 'fightplanner-stage-layout');
  ensureDirectory(dirPath);
  return dirPath;
}

function parseStageOrdersFromXml(xmlContent: string) {
  const stageOrders = new Map<string, number>();
  const structPattern = /<struct index="[^"]+">[\s\S]*?<\/struct>/g;
  const namePattern = new RegExp(
    `<string hash="${STAGE_NAME_HASH}">([^<]+)<\\/string>`,
  );
  const orderPattern = new RegExp(
    `<sbyte hash="${STAGE_ORDER_HASH}">(-?\\d+)<\\/sbyte>`,
  );

  for (const block of xmlContent.match(structPattern) ?? []) {
    const nameMatch = block.match(namePattern);
    const orderMatch = block.match(orderPattern);

    if (!nameMatch || !orderMatch) {
      continue;
    }

    stageOrders.set(nameMatch[1], Number(orderMatch[1]));
  }

  return stageOrders;
}

function getCanonicalMovableStageNames() {
  return getCanonicalStageLayout().movableStages.map((stage) => stage.xmlName);
}

function coerceStageOrderPayload(
  layoutState: StageLayoutOrderState | string[],
) {
  if (Array.isArray(layoutState)) {
    const visibleStageNames = [...layoutState];
    const visibleStageNameSet = new Set(visibleStageNames);

    return {
      visibleStageNames,
      hiddenStageNames: getCanonicalMovableStageNames().filter(
        (stageName) => !visibleStageNameSet.has(stageName),
      ),
    } satisfies StageLayoutOrderState;
  }

  return {
    visibleStageNames: Array.isArray(layoutState.visibleStageNames)
      ? [...layoutState.visibleStageNames]
      : [],
    hiddenStageNames: Array.isArray(layoutState.hiddenStageNames)
      ? [...layoutState.hiddenStageNames]
      : [],
  } satisfies StageLayoutOrderState;
}

function validateStageOrderPayload(
  layoutState: StageLayoutOrderState | string[],
) {
  const normalizedLayoutState = coerceStageOrderPayload(layoutState);
  const { movableStages } = getCanonicalStageLayout();
  const canonicalStageNames = new Set(
    movableStages.map((stage) => stage.xmlName),
  );
  const orderedStageNames = [
    ...normalizedLayoutState.visibleStageNames,
    ...normalizedLayoutState.hiddenStageNames,
  ];

  if (orderedStageNames.length !== movableStages.length) {
    throw new Error(
      `Expected ${movableStages.length} stage entries, received ${orderedStageNames.length}`,
    );
  }

  if (new Set(orderedStageNames).size !== orderedStageNames.length) {
    throw new Error('Duplicate stage identifiers detected in the layout payload');
  }

  const invalidStageNames = orderedStageNames.filter(
    (stageName) => !canonicalStageNames.has(stageName),
  );
  if (invalidStageNames.length > 0) {
    throw new Error(
      `Unknown stage identifiers received: ${invalidStageNames.join(', ')}`,
    );
  }

  return normalizedLayoutState;
}

function normalizePresetName(name: string) {
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) {
    throw new Error('Preset name cannot be empty');
  }

  return normalizedName;
}

function createPresetId() {
  return `stage-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPresetSummary(
  preset: StageLayoutPresetRecord,
): StageLayoutPresetSummary {
  return {
    id: preset.id,
    name: preset.name,
    updatedAt: preset.updatedAt,
  };
}

function sortPresetRecords(presets: StageLayoutPresetRecord[]) {
  return [...presets].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}

function readPresetManifest() {
  const manifestPath = getPresetManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return { ...EMPTY_PRESET_MANIFEST };
  }

  try {
    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as
      | Partial<StageLayoutPresetManifest>
      | null;

    const presets = Array.isArray(rawManifest?.presets)
      ? rawManifest.presets
          .map((preset) => {
            if (
              typeof preset?.id !== 'string' ||
              preset.id.trim().length === 0 ||
              typeof preset.name !== 'string' ||
              preset.name.trim().length === 0 ||
              typeof preset.updatedAt !== 'string'
            ) {
              return null;
            }

            try {
              const normalizedLayoutState = validateStageOrderPayload(
                Array.isArray((preset as any).orderedStageNames)
                  ? ((preset as any).orderedStageNames as string[])
                  : {
                      visibleStageNames: Array.isArray((preset as any).visibleStageNames)
                        ? ((preset as any).visibleStageNames as string[])
                        : [],
                      hiddenStageNames: Array.isArray((preset as any).hiddenStageNames)
                        ? ((preset as any).hiddenStageNames as string[])
                        : [],
                    },
              );

              return {
                id: preset.id,
                name: preset.name,
                updatedAt: preset.updatedAt,
                visibleStageNames: normalizedLayoutState.visibleStageNames,
                hiddenStageNames: normalizedLayoutState.hiddenStageNames,
              } satisfies StageLayoutPresetRecord;
            } catch {
              return null;
            }
          })
          .filter((preset): preset is StageLayoutPresetRecord => preset !== null)
      : [];

    return {
      activePresetId:
        typeof rawManifest?.activePresetId === 'string'
          ? rawManifest.activePresetId
          : null,
      presets: sortPresetRecords(presets),
    };
  } catch {
    return { ...EMPTY_PRESET_MANIFEST };
  }
}

function writePresetManifest(manifest: StageLayoutPresetManifest) {
  fs.writeFileSync(
    getPresetManifestPath(),
    JSON.stringify(
      {
        activePresetId: manifest.activePresetId,
        presets: sortPresetRecords(manifest.presets),
      },
      null,
      2,
    ),
    'utf8',
  );
}

function getActivePresetRecord(manifest: StageLayoutPresetManifest) {
  if (!manifest.activePresetId) {
    return null;
  }

  return (
    manifest.presets.find((preset) => preset.id === manifest.activePresetId) ||
    null
  );
}

function getCanonicalStageLayout() {
  const stages = EMBEDDED_STAGE_LAYOUT.map((stage) => ({ ...stage }));
  const randomStages = stages.filter((stage) => stage.isRandom);
  const movableStages = stages
    .filter((stage) => !stage.isRandom)
    .sort((left, right) => left.canonicalOrder - right.canonicalOrder);

  return {
    randomStages,
    movableStages,
  };
}

function sortMovableStages(
  stages: StageDescriptor[],
  stageOrders: Map<string, number>,
) {
  return [...stages].sort((left, right) => {
    const leftOrder = stageOrders.get(left.xmlName);
    const rightOrder = stageOrders.get(right.xmlName);

    const leftRank = typeof leftOrder === 'number' && leftOrder > 0
      ? leftOrder
      : Number.MAX_SAFE_INTEGER;
    const rightRank = typeof rightOrder === 'number' && rightOrder > 0
      ? rightOrder
      : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.canonicalOrder - right.canonicalOrder;
  });
}

function buildStageListsFromOrderState(
  stages: StageDescriptor[],
  layoutState: StageLayoutOrderState,
) {
  const stagesByName = new Map(
    stages.map((stage) => [stage.xmlName, stage] as const),
  );

  return {
    movableStages: layoutState.visibleStageNames
      .map((stageName) => stagesByName.get(stageName) || null)
      .filter((stage): stage is StageDescriptor => stage !== null),
    hiddenStages: layoutState.hiddenStageNames
      .map((stageName) => stagesByName.get(stageName) || null)
      .filter((stage): stage is StageDescriptor => stage !== null),
  };
}

function buildOrderStateFromStageOrders(
  stages: StageDescriptor[],
  stageOrders: Map<string, number>,
) {
  const visibleStageNames = sortMovableStages(
    stages.filter((stage) => {
      const stageOrder = stageOrders.get(stage.xmlName);
      return typeof stageOrder !== 'number' || stageOrder > 0;
    }),
    stageOrders,
  ).map((stage) => stage.xmlName);
  const hiddenStageNames = [...stages]
    .filter((stage) => {
      const stageOrder = stageOrders.get(stage.xmlName);
      return typeof stageOrder === 'number' && stageOrder <= 0;
    })
    .sort((left, right) => left.canonicalOrder - right.canonicalOrder)
    .map((stage) => stage.xmlName);

  return {
    visibleStageNames,
    hiddenStageNames,
  } satisfies StageLayoutOrderState;
}

function buildStageXml(layoutState: StageLayoutOrderState | string[]) {
  const normalizedLayoutState = validateStageOrderPayload(layoutState);
  const baseXmlPath = getSourceStageXmlPath();
  if (!fs.existsSync(baseXmlPath)) {
    throw new Error(
      'Stage layout requires your ui_stage_db.xml first. Import it from the Stages tab.',
    );
  }

  const baseXml = fs.readFileSync(baseXmlPath, 'utf8');
  const stageOrderMap = new Map<string, number>();
  normalizedLayoutState.visibleStageNames.forEach((stageName, index) => {
    stageOrderMap.set(stageName, index + 1);
  });
  normalizedLayoutState.hiddenStageNames.forEach((stageName) => {
    stageOrderMap.set(stageName, -1);
  });

  const updatedStageNames = new Set<string>();
  const structPattern = /<struct index="[^"]+">[\s\S]*?<\/struct>/g;
  const namePattern = new RegExp(
    `<string hash="${STAGE_NAME_HASH}">([^<]+)<\\/string>`,
  );
  const orderPattern = new RegExp(
    `(<sbyte hash="${STAGE_ORDER_HASH}">)(-?\\d+)(<\\/sbyte>)`,
  );

  const updatedXml = baseXml.replace(structPattern, (block) => {
    const nameMatch = block.match(namePattern);
    if (!nameMatch) {
      return block;
    }

    const xmlName = nameMatch[1];
    const nextOrder = stageOrderMap.get(xmlName);
    if (typeof nextOrder !== 'number') {
      return block;
    }

    updatedStageNames.add(xmlName);

    return block.replace(orderPattern, `$1${nextOrder}$3`);
  });

  const missingStages = [
    ...normalizedLayoutState.visibleStageNames,
    ...normalizedLayoutState.hiddenStageNames,
  ].filter(
    (stageName) => !updatedStageNames.has(stageName),
  );

  if (missingStages.length > 0) {
    throw new Error(
      `Could not update order for ${missingStages.length} stage(s): ${missingStages.join(', ')}`,
    );
  }

  return updatedXml;
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

function runParamXml(inputXmlPath: string): Promise<ParamXmlExecutionResult> {
  const executablePath = resolveParamXmlExecutable();
  const workingDirectory = path.dirname(inputXmlPath);
  const outputCandidates = getParamXmlOutputCandidates(inputXmlPath);

  outputCandidates.forEach((outputPath) => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  return new Promise((resolve, reject) => {
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

    child.on('error', (error) => {
      reject(error);
    });

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

      resolve({
        stdout,
        stderr,
        outputPath,
      });
    });
  });
}

function ensureStageModMetadata(modRootPath: string) {
  const infoTomlPath = path.join(modRootPath, 'info.toml');
  if (fs.existsSync(infoTomlPath)) {
    return;
  }

  const infoToml = [
    'display_name = "Stages Layout"',
    'version = "1.0.0"',
    'category = "stages"',
    'description = """',
    'Generated by the FightPlanner Stages tab.',
    '"""',
    '',
  ].join('\n');

  fs.writeFileSync(infoTomlPath, infoToml, 'utf8');
}

export function getStageLayoutData(): StageLayoutData {
  const { randomStages, movableStages: canonicalMovableStages } =
    getCanonicalStageLayout();
  const persistedLayoutPath = getPersistedLayoutPath();
  const presetManifest = readPresetManifest();
  const activePreset = getActivePresetRecord(presetManifest);

  let source: LayoutSource = 'canonical';
  let layoutState: StageLayoutOrderState = {
    visibleStageNames: canonicalMovableStages.map((stage) => stage.xmlName),
    hiddenStageNames: [],
  };

  if (activePreset) {
    try {
      layoutState = validateStageOrderPayload({
        visibleStageNames: activePreset.visibleStageNames,
        hiddenStageNames: activePreset.hiddenStageNames,
      });
      source = 'preset';
    } catch {
      presetManifest.activePresetId = null;
      writePresetManifest(presetManifest);
    }
  }

  if (source === 'canonical') {
    if (!fs.existsSync(persistedLayoutPath)) {
      throw new Error(
        'Stage layout requires your ui_stage_db.xml first. Import it from the Stages tab.',
      );
    }
    const persistedXml = fs.readFileSync(persistedLayoutPath, 'utf8');
    const savedOrders = parseStageOrdersFromXml(persistedXml);
    layoutState = buildOrderStateFromStageOrders(
      canonicalMovableStages,
      savedOrders,
    );
    source = 'saved';
  }

  const {
    movableStages,
    hiddenStages,
  } = buildStageListsFromOrderState(canonicalMovableStages, layoutState);

  const requiredCells =
    FIXED_OFFSET_CELLS + FIXED_RANDOM_CELLS + movableStages.length;
  const overflowCells = Math.max(0, requiredCells - EXPECTED_GRID_CELLS);
  const actualGridRows = Math.max(GRID_ROWS, Math.ceil(requiredCells / GRID_COLUMNS));

  return {
    source,
    fixedOffsetCells: FIXED_OFFSET_CELLS,
    fixedRandomCells: FIXED_RANDOM_CELLS,
    gridColumns: GRID_COLUMNS,
    gridRows: GRID_ROWS,
    actualGridRows,
    overflowCells,
    randomStages,
    movableStages,
    hiddenStages,
    activePreset:
      source === 'preset' ? toPresetSummary(getActivePresetRecord(presetManifest)!) : null,
    presets: presetManifest.presets.map(toPresetSummary),
    canonicalStageNames: canonicalMovableStages.map((stage) => stage.xmlName),
  };
}

export function importStageLayoutSource(filePath: string) {
  if (!filePath || path.basename(filePath) !== 'ui_stage_db.xml') {
    throw new Error('Select ui_stage_db.xml');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Stage XML not found: ${filePath}`);
  }

  const xml = fs.readFileSync(filePath, 'utf8');
  const stageOrders = parseStageOrdersFromXml(xml);
  if (stageOrders.size === 0) {
    throw new Error('Selected ui_stage_db.xml does not contain stage order data');
  }

  fs.writeFileSync(getPersistedLayoutPath(), xml, 'utf8');
  return {
    success: true as const,
    sourcePath: filePath,
    persistedLayoutPath: getPersistedLayoutPath(),
    ...getStageLayoutData(),
  };
}

export function loadStageLayoutPreset(presetId: string) {
  const manifest = readPresetManifest();
  const preset = manifest.presets.find((entry) => entry.id === presetId);

  if (!preset) {
    throw new Error(`Stage layout preset not found: ${presetId}`);
  }

  validateStageOrderPayload({
    visibleStageNames: preset.visibleStageNames,
    hiddenStageNames: preset.hiddenStageNames,
  });

  manifest.activePresetId = preset.id;
  writePresetManifest(manifest);

  return getStageLayoutData();
}

export function saveStageLayoutPreset(
  presetName: string,
  layoutState: StageLayoutOrderState,
  presetId?: string | null,
) {
  const normalizedLayoutState = validateStageOrderPayload(layoutState);

  const manifest = readPresetManifest();
  const normalizedPresetName = normalizePresetName(presetName);
  const existingPreset =
    typeof presetId === 'string' && presetId.length > 0
      ? manifest.presets.find((preset) => preset.id === presetId) || null
      : null;

  if (presetId && !existingPreset) {
    throw new Error(`Stage layout preset not found: ${presetId}`);
  }

  const duplicatePreset = manifest.presets.find((preset) => {
    return (
      preset.id !== existingPreset?.id &&
      preset.name.localeCompare(normalizedPresetName, undefined, {
        sensitivity: 'base',
      }) === 0
    );
  });

  if (duplicatePreset) {
    throw new Error(`A stage layout preset named "${normalizedPresetName}" already exists`);
  }

  const nextPreset: StageLayoutPresetRecord = {
    id: existingPreset?.id || createPresetId(),
    name: normalizedPresetName,
    updatedAt: new Date().toISOString(),
    visibleStageNames: [...normalizedLayoutState.visibleStageNames],
    hiddenStageNames: [...normalizedLayoutState.hiddenStageNames],
  };

  manifest.presets = sortPresetRecords([
    ...manifest.presets.filter((preset) => preset.id !== nextPreset.id),
    nextPreset,
  ]);
  manifest.activePresetId = nextPreset.id;

  writePresetManifest(manifest);

  return {
    success: true as const,
    preset: toPresetSummary(nextPreset),
    presets: manifest.presets.map(toPresetSummary),
  };
}

export async function saveStageLayout(layoutState: StageLayoutOrderState) {
  const normalizedLayoutState = validateStageOrderPayload(layoutState);
  const updatedXml = buildStageXml(normalizedLayoutState);
  const persistedLayoutPath = getPersistedLayoutPath();
  fs.writeFileSync(persistedLayoutPath, updatedXml, 'utf8');

  const tempStageDir = getTempStageDir();
  const tempInputXmlPath = path.join(tempStageDir, TEMP_STAGE_XML_FILE);
  fs.writeFileSync(tempInputXmlPath, updatedXml, 'utf8');

  const paramXmlResult = await runParamXml(tempInputXmlPath);

  const modsPath = store.get('modsPath') as string | null;
  if (!modsPath) {
    throw new Error(
      'Mods folder not configured. Set your mods path before saving a stage layout.',
    );
  }

  if (!fs.existsSync(modsPath)) {
    throw new Error(`Configured mods folder does not exist: ${modsPath}`);
  }

  const stageModRoot = path.join(modsPath, 'Stages Layout');
  const targetDirectory = path.join(
    stageModRoot,
    'ui',
    'param',
    'database',
  );

  ensureDirectory(targetDirectory);
  ensureStageModMetadata(stageModRoot);

  const targetPrcPath = path.join(targetDirectory, GENERATED_PRC_FILE);
  fs.copyFileSync(paramXmlResult.outputPath, targetPrcPath);

  const requiredCells =
    FIXED_OFFSET_CELLS
    + FIXED_RANDOM_CELLS
    + normalizedLayoutState.visibleStageNames.length;
  const overflowCells = Math.max(0, requiredCells - EXPECTED_GRID_CELLS);
  const actualGridRows = Math.max(
    GRID_ROWS,
    Math.ceil(requiredCells / GRID_COLUMNS),
  );

  return {
    success: true as const,
    source: 'saved' as const,
    persistedLayoutPath,
    tempInputXmlPath,
    generatedPrcPath: paramXmlResult.outputPath,
    modPrcPath: targetPrcPath,
    stdout: paramXmlResult.stdout,
    stderr: paramXmlResult.stderr,
    overflowCells,
    actualGridRows,
  };
}
