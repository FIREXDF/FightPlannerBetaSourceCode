type MtpTransferFile = {
  id: string;
  remotePath: string;
  size: number;
  itemName: string;
  itemIndex: number;
  totalItems: number;
};

type MtpProgress = {
  currentMod: number;
  totalMods: number;
  transferredCount: number;
  totalFiles: number;
  progress: number;
  currentModName?: string;
  currentFileName?: string;
};

type ReadFileChunk = (
  id: string,
  offset: number,
  length: number,
) => Promise<Uint8Array>;

type MtpChild = {
  handle: number;
  format: number;
  size: number;
  name: string;
};

const MTP_CONTAINER_COMMAND = 0x0001;
const MTP_CONTAINER_DATA = 0x0002;
const MTP_CONTAINER_RESPONSE = 0x0003;

const MTP_OP_OPEN_SESSION = 0x1002;
const MTP_OP_CLOSE_SESSION = 0x1003;
const MTP_OP_GET_STORAGE_IDS = 0x1004;
const MTP_OP_GET_OBJECT_HANDLES = 0x1007;
const MTP_OP_GET_OBJECT_INFO = 0x1008;
const MTP_OP_GET_OBJECT = 0x1009;
const MTP_OP_DELETE_OBJECT = 0x100b;
const MTP_OP_SEND_OBJECT_INFO = 0x100c;
const MTP_OP_SEND_OBJECT = 0x100d;
const MTP_OP_SET_OBJECT_PROP_VALUE = 0x9804;

const MTP_RESPONSE_OK = 0x2001;
const MTP_RESPONSE_SESSION_ALREADY_OPEN = 0x201e;

const MTP_FORMAT_ALL = 0x0000;
const MTP_FORMAT_UNDEFINED = 0x3000;
const MTP_FORMAT_ASSOCIATION = 0x3001;
const MTP_ASSOCIATION_GENERIC_FOLDER = 0x0001;
const MTP_PROPERTY_OBJECT_FILE_NAME = 0xdc07;
const MTP_ROOT_OBJECT = 0xffffffff;

const MTP_IO_CHUNK_SIZE = 1024 * 1024;
const MTP_MAX_BUFFERED_CONTAINER_SIZE = 64 * 1024 * 1024;
const MTP_TRANSFER_TIMEOUT_MS = 30000;
const MTP_MAX_OBJECT_SIZE = 0xffffffff - 12;

class MTPTransferClient {
  private device: any = null;
  private endpointIn = 0;
  private endpointOut = 0;
  private packetSize = 512;
  private interfaceNumber = 0;
  private alternateSetting = 0;
  private transactionId = 1;
  private storageId = 0;
  private interfaceClaimed = false;
  private sessionOpened = false;
  private childrenCache = new Map<number, Map<string, MtpChild>>();

  async connect() {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB is not available in this Electron build.');
    }

    this.device = await (navigator as any).usb.requestDevice({
      filters: [{ classCode: 0x06, subclassCode: 0x01, protocolCode: 0x01 }],
    });

    await this.device.open();
    if (!this.device.configuration) {
      const configurationValue =
        this.device.configurations?.[0]?.configurationValue || 1;
      await this.device.selectConfiguration(configurationValue);
    }

    this.findEndpoints();
    try {
      await this.device.claimInterface(this.interfaceNumber);
      this.interfaceClaimed = true;
      const selectedAlternate = this.device.configuration?.interfaces?.find(
        (iface) => iface.interfaceNumber === this.interfaceNumber,
      )?.alternate?.alternateSetting;
      if (
        this.alternateSetting !== selectedAlternate &&
        typeof this.device.selectAlternateInterface === 'function'
      ) {
        await this.device.selectAlternateInterface(
          this.interfaceNumber,
          this.alternateSetting,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        [
          'Unable to claim the Switch MTP USB interface.',
          'Another app may already be using it.',
          'Close DBI, mtp-server, file managers, emulator USB passthrough, or any other tool connected to the Switch, then unplug and reconnect the USB cable.',
          `Original error: ${detail}`,
        ].join(' '),
      );
    }

    await this.openSession();
    this.sessionOpened = true;

    const storageIds = await this.getStorageIds();
    if (storageIds.length === 0) {
      throw new Error('No MTP storage found on this device.');
    }
    this.storageId = storageIds[0];
  }

  async disconnect() {
    if (!this.device) return;

    if (this.sessionOpened) {
      try {
        await this.sendCommand(MTP_OP_CLOSE_SESSION, []);
        await this.readResponse([MTP_RESPONSE_OK]);
      } catch (error) {
        console.warn('Unable to close MTP session cleanly:', error);
      }
    }

    if (this.interfaceClaimed) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
      } catch (error) {}
    }

    try {
      await this.device.close();
    } catch (error) {}

    this.device = null;
    this.interfaceClaimed = false;
    this.sessionOpened = false;
    this.childrenCache.clear();
  }

  async uploadFiles(
    files: MtpTransferFile[],
    readFileChunk: ReadFileChunk,
    onProgress: (progress: MtpProgress) => void,
    skipExistingCheck = false,
  ) {
    let copiedCount = 0;
    let processedCount = 0;
    let processedBytes = 0;
    const totalFiles = files.length;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const totalMods = files.reduce(
      (max, file) => Math.max(max, file.totalItems),
      0,
    );

    const reportProgress = (file: MtpTransferFile, currentFileBytes = 0) => {
      const progress =
        totalBytes > 0
          ? Math.min(
              100,
              Math.round(
                ((processedBytes + currentFileBytes) / totalBytes) * 100,
              ),
            )
          : totalFiles > 0
            ? Math.min(100, Math.round((processedCount / totalFiles) * 100))
            : 100;

      onProgress({
        currentMod: file.itemIndex,
        totalMods,
        transferredCount: processedCount,
        totalFiles,
        progress,
        currentModName: file.itemName,
        currentFileName: pathBasename(file.remotePath),
      });
    };

    for (const file of files) {
      const remoteParts = file.remotePath.split('/').filter(Boolean);
      const fileName = remoteParts.pop();
      if (!fileName) {
        throw new Error(`Invalid MTP destination path: ${file.remotePath}`);
      }
      if (file.size > MTP_MAX_OBJECT_SIZE) {
        throw new Error(
          `MTP file is too large for the protocol: ${fileName} (${file.size} bytes)`,
        );
      }

      reportProgress(file);
      const parentHandle = await this.ensureDirectoryPath(remoteParts);
      const existing = await this.findChild(parentHandle, fileName);

      if (existing?.format === MTP_FORMAT_ASSOCIATION) {
        throw new Error(
          `MTP destination ${file.remotePath} is a directory, not a file`,
        );
      }

      if (
        !skipExistingCheck &&
        existing?.size === file.size &&
        (await this.objectMatchesLocalFile(
          existing.handle,
          file,
          readFileChunk,
        ))
      ) {
        processedCount++;
        processedBytes += file.size;
        reportProgress(file);
        console.log(`Skipped identical MTP file: ${file.remotePath}`);
        continue;
      }

      await this.uploadFileSafely(
        parentHandle,
        fileName,
        file,
        existing?.handle ?? null,
        readFileChunk,
        (bytesTransferred) => reportProgress(file, bytesTransferred),
      );
      copiedCount++;
      processedCount++;
      processedBytes += file.size;
      reportProgress(file);
    }

    return copiedCount;
  }

  private findEndpoints() {
    const interfaces = this.device.configuration?.interfaces || [];

    for (const iface of interfaces) {
      for (const alternate of iface.alternates || []) {
        const endpoints = alternate.endpoints || [];
        const endpointIn = endpoints.find(
          (endpoint) => endpoint.direction === 'in' && endpoint.type === 'bulk',
        );
        const endpointOut = endpoints.find(
          (endpoint) =>
            endpoint.direction === 'out' && endpoint.type === 'bulk',
        );

        if (endpointIn && endpointOut) {
          this.interfaceNumber = iface.interfaceNumber;
          this.alternateSetting = alternate.alternateSetting || 0;
          this.endpointIn = endpointIn.endpointNumber;
          this.endpointOut = endpointOut.endpointNumber;
          this.packetSize =
            endpointIn.packetSize || endpointOut.packetSize || 512;
          return;
        }
      }
    }

    throw new Error('No MTP bulk endpoints found.');
  }

  private async openSession() {
    await this.sendCommand(MTP_OP_OPEN_SESSION, [1]);
    await this.readResponse([
      MTP_RESPONSE_OK,
      MTP_RESPONSE_SESSION_ALREADY_OPEN,
    ]);
  }

  private async getStorageIds() {
    await this.sendCommand(MTP_OP_GET_STORAGE_IDS, []);
    const data = await this.readDataContainer(MTP_OP_GET_STORAGE_IDS);
    await this.readResponse([MTP_RESPONSE_OK]);

    this.requireLength(data, 16, 'MTP storage ID response');
    const count = this.readUint32(data, 12);
    this.requireLength(data, 16 + count * 4, 'MTP storage ID list');
    const storageIds: number[] = [];
    for (let i = 0; i < count; i++) {
      storageIds.push(this.readUint32(data, 16 + i * 4));
    }
    return storageIds;
  }

  private async ensureDirectoryPath(parts: string[]) {
    let parent = MTP_ROOT_OBJECT;

    for (const part of parts) {
      const existing = await this.findChild(parent, part);
      if (existing) {
        if (existing.format !== MTP_FORMAT_ASSOCIATION) {
          throw new Error(`MTP path component is not a directory: ${part}`);
        }
        parent = existing.handle;
        continue;
      }

      parent = await this.createDirectory(parent, part);
    }

    return parent;
  }

  private async findChild(parentHandle: number, name: string) {
    let children = this.childrenCache.get(parentHandle);
    if (!children) {
      children = new Map<string, MtpChild>();
      const handles = await this.getObjectHandles(parentHandle);
      for (const handle of handles) {
        const info = await this.getObjectInfo(handle);
        children.set(info.name, { handle, ...info });
      }
      this.childrenCache.set(parentHandle, children);
    }
    return children.get(name) || null;
  }

  private async getObjectHandles(parentHandle: number) {
    await this.sendCommand(MTP_OP_GET_OBJECT_HANDLES, [
      this.storageId,
      MTP_FORMAT_ALL,
      parentHandle,
    ]);
    const data = await this.readDataContainer(MTP_OP_GET_OBJECT_HANDLES);
    await this.readResponse([MTP_RESPONSE_OK]);

    this.requireLength(data, 16, 'MTP object handle response');
    const count = this.readUint32(data, 12);
    this.requireLength(data, 16 + count * 4, 'MTP object handle list');
    const handles: number[] = [];
    for (let i = 0; i < count; i++) {
      handles.push(this.readUint32(data, 16 + i * 4));
    }
    return handles;
  }

  private async getObjectInfo(handle: number) {
    await this.sendCommand(MTP_OP_GET_OBJECT_INFO, [handle]);
    const data = await this.readDataContainer(MTP_OP_GET_OBJECT_INFO);
    await this.readResponse([MTP_RESPONSE_OK]);

    this.requireLength(data, 65, 'MTP object info');
    return {
      format: this.readUint16(data, 16),
      size: this.readUint32(data, 20),
      name: this.readMtpString(data, 64),
    };
  }

  private async objectMatchesLocalFile(
    handle: number,
    file: MtpTransferFile,
    readFileChunk: ReadFileChunk,
  ) {
    await this.sendCommand(MTP_OP_GET_OBJECT, [handle]);
    const matches = await this.compareDataContainerWithLocalFile(
      MTP_OP_GET_OBJECT,
      file,
      readFileChunk,
    );
    await this.readResponse([MTP_RESPONSE_OK]);
    return matches;
  }

  private async createDirectory(parentHandle: number, name: string) {
    const objectInfo = this.createObjectInfo(
      name,
      MTP_FORMAT_ASSOCIATION,
      0,
      parentHandle,
    );
    await this.sendCommand(MTP_OP_SEND_OBJECT_INFO, [
      this.storageId,
      parentHandle,
    ]);
    const response = await this.sendDataAndReadResponse(
      MTP_OP_SEND_OBJECT_INFO,
      objectInfo,
    );
    const handle = response.params[2];
    if (!handle) {
      throw new Error(`MTP device did not return a handle for folder ${name}`);
    }
    this.cacheChild(parentHandle, {
      handle,
      format: MTP_FORMAT_ASSOCIATION,
      size: 0,
      name,
    });
    return handle;
  }

  private async uploadFileSafely(
    parentHandle: number,
    fileName: string,
    file: MtpTransferFile,
    existingHandle: number | null,
    readFileChunk: ReadFileChunk,
    onChunk: (bytesTransferred: number) => void,
  ) {
    if (existingHandle === null) {
      await this.uploadFile(
        parentHandle,
        fileName,
        file,
        readFileChunk,
        onChunk,
      );
      return;
    }

    const temporaryName = this.createTemporaryName(fileName, 'new');
    const backupName = this.createTemporaryName(fileName, 'backup');
    const newHandle = await this.uploadFile(
      parentHandle,
      temporaryName,
      file,
      readFileChunk,
      onChunk,
    );

    let backupCreated = false;
    try {
      await this.setObjectFileName(existingHandle, backupName);
      backupCreated = true;
      await this.setObjectFileName(newHandle, fileName);
    } catch (error) {
      if (backupCreated) {
        try {
          await this.setObjectFileName(existingHandle, fileName);
        } catch (restoreError) {
          console.error('Unable to restore MTP backup name:', restoreError);
        }
      }
      try {
        await this.deleteObject(newHandle);
      } catch (cleanupError) {
        console.error('Unable to remove temporary MTP object:', cleanupError);
      }
      throw error;
    }

    try {
      await this.deleteObject(existingHandle);
    } catch (cleanupError) {
      console.warn(
        `MTP replacement succeeded but backup ${backupName} could not be removed:`,
        cleanupError,
      );
    }
  }

  private async uploadFile(
    parentHandle: number,
    fileName: string,
    file: MtpTransferFile,
    readFileChunk: ReadFileChunk,
    onChunk: (bytesTransferred: number) => void,
  ) {
    const objectInfo = this.createObjectInfo(
      fileName,
      MTP_FORMAT_UNDEFINED,
      file.size,
      parentHandle,
    );
    await this.sendCommand(MTP_OP_SEND_OBJECT_INFO, [
      this.storageId,
      parentHandle,
    ]);
    const response = await this.sendDataAndReadResponse(
      MTP_OP_SEND_OBJECT_INFO,
      objectInfo,
    );
    const objectHandle = response.params[2];
    if (!objectHandle) {
      throw new Error(`MTP device did not return a handle for ${fileName}`);
    }
    this.cacheChild(parentHandle, {
      handle: objectHandle,
      format: MTP_FORMAT_UNDEFINED,
      size: file.size,
      name: fileName,
    });

    await this.sendCommand(MTP_OP_SEND_OBJECT, []);
    await this.sendFileDataContainer(
      MTP_OP_SEND_OBJECT,
      file,
      readFileChunk,
      onChunk,
    );
    await this.readResponse([MTP_RESPONSE_OK]);
    return objectHandle;
  }

  private async setObjectFileName(handle: number, fileName: string) {
    await this.sendCommand(MTP_OP_SET_OBJECT_PROP_VALUE, [
      handle,
      MTP_PROPERTY_OBJECT_FILE_NAME,
    ]);
    await this.sendDataAndReadResponse(
      MTP_OP_SET_OBJECT_PROP_VALUE,
      this.encodeMtpString(fileName),
    );
    this.updateCachedObjectName(handle, fileName);
  }

  private async deleteObject(handle: number) {
    await this.sendCommand(MTP_OP_DELETE_OBJECT, [handle, 0]);
    await this.readResponse([MTP_RESPONSE_OK]);
    this.removeCachedObject(handle);
  }

  private cacheChild(parentHandle: number, child: MtpChild) {
    let children = this.childrenCache.get(parentHandle);
    if (!children) {
      children = new Map<string, MtpChild>();
      this.childrenCache.set(parentHandle, children);
    }
    children.set(child.name, child);
  }

  private updateCachedObjectName(handle: number, fileName: string) {
    for (const children of this.childrenCache.values()) {
      for (const [name, child] of children.entries()) {
        if (child.handle === handle) {
          children.delete(name);
          child.name = fileName;
          children.set(fileName, child);
          return;
        }
      }
    }
  }

  private removeCachedObject(handle: number) {
    for (const children of this.childrenCache.values()) {
      for (const [name, child] of children.entries()) {
        if (child.handle === handle) {
          children.delete(name);
          return;
        }
      }
    }
  }

  private createObjectInfo(
    fileName: string,
    objectFormat: number,
    objectSize: number,
    parentHandle: number,
  ) {
    const fixed = new Uint8Array(52);
    const view = new DataView(fixed.buffer);
    view.setUint32(0, this.storageId, true);
    view.setUint16(4, objectFormat, true);
    view.setUint32(8, objectSize, true);
    view.setUint32(
      38,
      parentHandle === MTP_ROOT_OBJECT ? 0 : parentHandle,
      true,
    );
    view.setUint16(
      42,
      objectFormat === MTP_FORMAT_ASSOCIATION
        ? MTP_ASSOCIATION_GENERIC_FOLDER
        : 0,
      true,
    );

    return this.concatArrays([
      fixed,
      this.encodeMtpString(fileName),
      this.encodeMtpString(''),
      this.encodeMtpString(''),
      this.encodeMtpString(''),
    ]);
  }

  private async sendCommand(operation: number, params: number[]) {
    const transactionId = this.transactionId++;
    const container = this.createContainer(
      MTP_CONTAINER_COMMAND,
      operation,
      transactionId,
      params,
    );
    await this.transferOutChecked(container);
    return transactionId;
  }

  private async sendDataAndReadResponse(
    operation: number,
    payload: Uint8Array,
  ) {
    const transactionId = this.transactionId - 1;
    const dataContainer = this.createContainer(
      MTP_CONTAINER_DATA,
      operation,
      transactionId,
      [],
      payload,
    );
    await this.transferOutChecked(dataContainer);
    return await this.readResponse([MTP_RESPONSE_OK]);
  }

  private async sendFileDataContainer(
    operation: number,
    file: MtpTransferFile,
    readFileChunk: ReadFileChunk,
    onChunk: (bytesTransferred: number) => void,
  ) {
    const transactionId = this.transactionId - 1;
    const header = this.createStreamingContainerHeader(
      MTP_CONTAINER_DATA,
      operation,
      transactionId,
      12 + file.size,
    );
    let offset = 0;

    if (file.size === 0) {
      await this.transferOutChecked(header);
      return;
    }

    const firstRequestedLength = Math.min(
      MTP_IO_CHUNK_SIZE - header.byteLength,
      file.size,
    );
    const firstBytes = await readFileChunk(
      file.id,
      offset,
      firstRequestedLength,
    );
    if (firstBytes.byteLength !== firstRequestedLength) {
      throw new Error(
        `Unable to read complete local MTP chunk for ${file.remotePath}`,
      );
    }
    const firstContainerChunk = new Uint8Array(
      header.byteLength + firstBytes.byteLength,
    );
    firstContainerChunk.set(header);
    firstContainerChunk.set(firstBytes, header.byteLength);
    await this.transferOutChecked(firstContainerChunk);
    offset += firstBytes.byteLength;
    onChunk(offset);

    while (offset < file.size) {
      const requestedLength = Math.min(MTP_IO_CHUNK_SIZE, file.size - offset);
      const bytes = await readFileChunk(file.id, offset, requestedLength);
      if (bytes.byteLength !== requestedLength) {
        throw new Error(
          `Unable to read complete local MTP chunk for ${file.remotePath}`,
        );
      }
      await this.transferOutChecked(bytes);
      offset += bytes.byteLength;
      onChunk(offset);
    }
  }

  private async readDataContainer(operation: number) {
    const container = await this.readContainer();
    this.validateContainer(container, MTP_CONTAINER_DATA, operation);
    return container;
  }

  private async readResponse(acceptedCodes: number[]) {
    const container = await this.readContainer();
    this.requireLength(container, 12, 'MTP response');
    const type = this.readUint16(container, 4);
    const code = this.readUint16(container, 6);
    const transactionId = this.readUint32(container, 8);
    const expectedTransactionId = this.transactionId - 1;

    if (
      type !== MTP_CONTAINER_RESPONSE ||
      !acceptedCodes.includes(code) ||
      transactionId !== expectedTransactionId
    ) {
      throw new Error(
        `Unexpected MTP response: type=${type} code=0x${code.toString(16)} transaction=${transactionId}`,
      );
    }

    const params: number[] = [];
    for (let offset = 12; offset + 4 <= container.byteLength; offset += 4) {
      params.push(this.readUint32(container, offset));
    }

    return { code, params };
  }

  private async readContainer() {
    const first = await this.transferInChecked(
      Math.max(this.packetSize, MTP_IO_CHUNK_SIZE),
    );
    this.requireLength(first, 12, 'MTP container header');
    const expectedLength = this.readUint32(first, 0);
    if (
      expectedLength < 12 ||
      expectedLength > MTP_MAX_BUFFERED_CONTAINER_SIZE
    ) {
      throw new Error(
        `Invalid buffered MTP container length: ${expectedLength}`,
      );
    }

    const parts = [first];
    let receivedLength = first.byteLength;
    while (receivedLength < expectedLength) {
      const next = await this.transferInChecked(
        Math.min(MTP_IO_CHUNK_SIZE, expectedLength - receivedLength),
      );
      parts.push(next);
      receivedLength += next.byteLength;
    }

    return this.concatArrays(parts).slice(0, expectedLength);
  }

  private async compareDataContainerWithLocalFile(
    operation: number,
    file: MtpTransferFile,
    readFileChunk: ReadFileChunk,
  ) {
    const first = await this.transferInChecked(
      Math.max(this.packetSize, MTP_IO_CHUNK_SIZE),
    );
    this.requireLength(first, 12, 'MTP object data header');
    this.validateContainer(first, MTP_CONTAINER_DATA, operation);
    const expectedLength = this.readUint32(first, 0);
    if (expectedLength < 12 || expectedLength > MTP_MAX_OBJECT_SIZE + 12) {
      throw new Error(`Invalid MTP object data length: ${expectedLength}`);
    }
    const expectedPayloadLength = expectedLength - 12;
    let matches = expectedPayloadLength === file.size;
    let remoteOffset = 0;

    const comparePayload = async (payload: Uint8Array) => {
      if (!matches || payload.byteLength === 0) {
        remoteOffset += payload.byteLength;
        return;
      }
      const localBytes = await readFileChunk(
        file.id,
        remoteOffset,
        payload.byteLength,
      );
      if (!this.bytesEqual(payload, localBytes)) {
        matches = false;
      }
      remoteOffset += payload.byteLength;
    };

    await comparePayload(
      first.slice(12, Math.min(first.byteLength, expectedLength)),
    );
    let receivedLength = Math.min(first.byteLength, expectedLength);
    while (receivedLength < expectedLength) {
      const next = await this.transferInChecked(
        Math.min(MTP_IO_CHUNK_SIZE, expectedLength - receivedLength),
      );
      await comparePayload(next);
      receivedLength += next.byteLength;
    }

    return matches && remoteOffset === file.size;
  }

  private validateContainer(
    container: Uint8Array,
    expectedType: number,
    expectedCode: number,
  ) {
    this.requireLength(container, 12, 'MTP container');
    const type = this.readUint16(container, 4);
    const code = this.readUint16(container, 6);
    const transactionId = this.readUint32(container, 8);
    const expectedTransactionId = this.transactionId - 1;

    if (
      type !== expectedType ||
      code !== expectedCode ||
      transactionId !== expectedTransactionId
    ) {
      throw new Error(
        `Unexpected MTP container: type=${type} code=0x${code.toString(16)} transaction=${transactionId}`,
      );
    }
  }

  private async transferInChecked(length: number) {
    const result = await this.withTimeout<any>(
      this.device.transferIn(this.endpointIn, length),
      'MTP USB read',
    );
    if (result.status !== 'ok' || !result.data) {
      throw new Error(`MTP USB read failed with status ${result.status}`);
    }
    const bytes = new Uint8Array(
      result.data.buffer,
      result.data.byteOffset,
      result.data.byteLength,
    );
    if (bytes.byteLength === 0) {
      throw new Error('MTP USB read returned no data');
    }
    return bytes;
  }

  private async transferOutChecked(bytes: Uint8Array) {
    const result = await this.withTimeout<any>(
      this.device.transferOut(this.endpointOut, bytes),
      'MTP USB write',
    );
    if (result.status !== 'ok') {
      throw new Error(`MTP USB write failed with status ${result.status}`);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, operation: string) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  `${operation} timed out after ${MTP_TRANSFER_TIMEOUT_MS} ms`,
                ),
              ),
            MTP_TRANSFER_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private createContainer(
    type: number,
    code: number,
    transactionId: number,
    params: number[],
    payload?: Uint8Array,
  ) {
    const length = 12 + params.length * 4 + (payload?.byteLength || 0);
    const container = this.createContainerHeader(
      type,
      code,
      transactionId,
      length,
    );

    params.forEach((param, index) => {
      new DataView(container.buffer).setUint32(
        12 + index * 4,
        param >>> 0,
        true,
      );
    });

    if (payload) {
      container.set(payload, 12 + params.length * 4);
    }
    return container;
  }

  private createContainerHeader(
    type: number,
    code: number,
    transactionId: number,
    length: number,
  ) {
    const container = new Uint8Array(length);
    const view = new DataView(container.buffer);
    view.setUint32(0, length, true);
    view.setUint16(4, type, true);
    view.setUint16(6, code, true);
    view.setUint32(8, transactionId, true);
    return container;
  }

  private createStreamingContainerHeader(
    type: number,
    code: number,
    transactionId: number,
    totalLength: number,
  ) {
    const header = new Uint8Array(12);
    const view = new DataView(header.buffer);
    view.setUint32(0, totalLength, true);
    view.setUint16(4, type, true);
    view.setUint16(6, code, true);
    view.setUint32(8, transactionId, true);
    return header;
  }

  private createTemporaryName(fileName: string, kind: string) {
    const extension = fileName.includes('.')
      ? `.${fileName.split('.').pop()}`
      : '';
    const baseName = extension
      ? fileName.slice(0, -extension.length)
      : fileName;
    const suffix = `.fightplanner-${kind}-${Date.now().toString(36)}`;
    const maxBaseLength = Math.max(1, 254 - suffix.length - extension.length);
    return `${baseName.slice(0, maxBaseLength)}${suffix}${extension}`;
  }

  private encodeMtpString(value: string) {
    if (!value) {
      return new Uint8Array([0]);
    }

    const normalized = value.slice(0, 254);
    const encoded = new Uint8Array(1 + (normalized.length + 1) * 2);
    encoded[0] = normalized.length + 1;

    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      encoded[1 + i * 2] = code & 0xff;
      encoded[2 + i * 2] = (code >> 8) & 0xff;
    }

    return encoded;
  }

  private readMtpString(bytes: Uint8Array, offset: number) {
    const length = bytes[offset];
    if (!length) return '';
    this.requireLength(bytes, offset + 1 + length * 2, 'MTP encoded string');

    let result = '';
    for (let i = 0; i < length - 1; i++) {
      const charOffset = offset + 1 + i * 2;
      result += String.fromCharCode(
        bytes[charOffset] | (bytes[charOffset + 1] << 8),
      );
    }
    return result;
  }

  private readUint16(bytes: Uint8Array, offset: number) {
    return new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint16(offset, true);
  }

  private readUint32(bytes: Uint8Array, offset: number) {
    return new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(offset, true);
  }

  private concatArrays(parts: Uint8Array[]) {
    const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }

    return result;
  }

  private bytesEqual(left: Uint8Array, right: Uint8Array) {
    if (left.byteLength !== right.byteLength) {
      return false;
    }

    for (let i = 0; i < left.byteLength; i++) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }

  private requireLength(
    bytes: Uint8Array,
    minimumLength: number,
    context: string,
  ) {
    if (bytes.byteLength < minimumLength) {
      throw new Error(
        `${context} is truncated (${bytes.byteLength}/${minimumLength} bytes)`,
      );
    }
  }
}

function pathBasename(remotePath: string) {
  const parts = remotePath.split('/').filter(Boolean);
  return parts[parts.length - 1] || remotePath;
}
