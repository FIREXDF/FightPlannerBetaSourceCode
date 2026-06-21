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

const MTP_RESPONSE_OK = 0x2001;
const MTP_RESPONSE_SESSION_ALREADY_OPEN = 0x201e;

const MTP_FORMAT_ALL = 0x0000;
const MTP_FORMAT_UNDEFINED = 0x3000;
const MTP_FORMAT_ASSOCIATION = 0x3001;
const MTP_ASSOCIATION_GENERIC_FOLDER = 0x0001;
const MTP_ROOT_OBJECT = 0xffffffff;

class MTPTransferClient {
  private device: any = null;
  private endpointIn = 0;
  private endpointOut = 0;
  private packetSize = 512;
  private interfaceNumber = 0;
  private transactionId = 1;
  private storageId = 0;

  async connect() {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB is not available in this Electron build.');
    }

    this.device = await (navigator as any).usb.requestDevice({
      filters: [{ classCode: 0x06, subclassCode: 0x01, protocolCode: 0x01 }],
    });

    await this.device.open();
    if (!this.device.configuration) {
      await this.device.selectConfiguration(1);
    }

    this.findEndpoints();
    try {
      await this.device.claimInterface(this.interfaceNumber);
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

    const storageIds = await this.getStorageIds();
    if (storageIds.length === 0) {
      throw new Error('No MTP storage found on this device.');
    }
    this.storageId = storageIds[0];
  }

  async disconnect() {
    if (!this.device) return;

    try {
      await this.sendCommand(MTP_OP_CLOSE_SESSION, []);
      await this.readResponse([MTP_RESPONSE_OK]);
    } catch (error) {
      console.warn('Unable to close MTP session cleanly:', error);
    }

    try {
      await this.device.releaseInterface(this.interfaceNumber);
    } catch (error) {}

    try {
      await this.device.close();
    } catch (error) {}

    this.device = null;
  }

  async uploadFiles(
    files: MtpTransferFile[],
    readFile: (id: string) => Promise<Uint8Array>,
    onProgress: (progress: MtpProgress) => void,
  ) {
    let transferredCount = 0;
    const totalFiles = files.length;
    const totalMods = files.reduce(
      (max, file) => Math.max(max, file.totalItems),
      0,
    );

    for (const file of files) {
      const remoteParts = file.remotePath.split('/').filter(Boolean);
      const fileName = remoteParts.pop();
      if (!fileName) continue;

      onProgress({
        currentMod: file.itemIndex,
        totalMods,
        transferredCount,
        totalFiles,
        progress:
          totalFiles > 0
            ? Math.round((transferredCount / totalFiles) * 100)
            : 0,
        currentModName: file.itemName,
        currentFileName: fileName,
      });

      const parentHandle = await this.ensureDirectoryPath(remoteParts);
      const existing = await this.findChild(parentHandle, fileName);
      let bytes: Uint8Array | null = null;

      if (existing?.size === file.size) {
        bytes = await readFile(file.id);
        const remoteBytes = await this.getObject(existing.handle);
        if (this.bytesEqual(remoteBytes, bytes)) {
          console.log(`Skipped existing MTP file: ${file.remotePath}`);
          continue;
        }
      }

      if (existing) {
        await this.deleteObject(existing.handle);
      }

      if (!bytes) {
        bytes = await readFile(file.id);
      }
      await this.uploadFile(parentHandle, fileName, bytes);
      transferredCount++;

      onProgress({
        currentMod: file.itemIndex,
        totalMods,
        transferredCount,
        totalFiles,
        progress:
          totalFiles > 0
            ? Math.min(100, Math.round((transferredCount / totalFiles) * 100))
            : 100,
        currentModName: file.itemName,
        currentFileName: fileName,
      });
    }

    return transferredCount;
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

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = view.getUint32(12, true);
    const storageIds: number[] = [];
    for (let i = 0; i < count; i++) {
      storageIds.push(view.getUint32(16 + i * 4, true));
    }
    return storageIds;
  }

  private async ensureDirectoryPath(parts: string[]) {
    let parent = MTP_ROOT_OBJECT;

    for (const part of parts) {
      const existing = await this.findChild(parent, part);
      if (existing?.format === MTP_FORMAT_ASSOCIATION) {
        parent = existing.handle;
        continue;
      }

      parent = await this.createDirectory(parent, part);
    }

    return parent;
  }

  private async findChild(parentHandle: number, name: string) {
    const handles = await this.getObjectHandles(parentHandle);

    for (const handle of handles) {
      const info = await this.getObjectInfo(handle);
      if (info.name === name) {
        return { handle, ...info };
      }
    }

    return null;
  }

  private async getObjectHandles(parentHandle: number) {
    await this.sendCommand(MTP_OP_GET_OBJECT_HANDLES, [
      this.storageId,
      MTP_FORMAT_ALL,
      parentHandle,
    ]);
    const data = await this.readDataContainer(MTP_OP_GET_OBJECT_HANDLES);
    await this.readResponse([MTP_RESPONSE_OK]);

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = view.getUint32(12, true);
    const handles: number[] = [];
    for (let i = 0; i < count; i++) {
      handles.push(view.getUint32(16 + i * 4, true));
    }
    return handles;
  }

  private async getObjectInfo(handle: number) {
    await this.sendCommand(MTP_OP_GET_OBJECT_INFO, [handle]);
    const data = await this.readDataContainer(MTP_OP_GET_OBJECT_INFO);
    await this.readResponse([MTP_RESPONSE_OK]);

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      format: view.getUint16(16, true),
      size: view.getUint32(20, true),
      name: this.readMtpString(data, 64),
    };
  }

  private async getObject(handle: number) {
    await this.sendCommand(MTP_OP_GET_OBJECT, [handle]);
    const data = await this.readDataContainer(MTP_OP_GET_OBJECT);
    await this.readResponse([MTP_RESPONSE_OK]);
    return data.slice(12);
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
      0,
    ]);
    const response = await this.sendDataAndReadResponse(
      MTP_OP_SEND_OBJECT_INFO,
      objectInfo,
    );
    return response.params[2] || response.params[0];
  }

  private async uploadFile(
    parentHandle: number,
    fileName: string,
    bytes: Uint8Array,
  ) {
    const objectInfo = this.createObjectInfo(
      fileName,
      MTP_FORMAT_UNDEFINED,
      bytes.length,
      parentHandle,
    );
    await this.sendCommand(MTP_OP_SEND_OBJECT_INFO, [
      this.storageId,
      parentHandle,
      0,
    ]);
    await this.sendDataAndReadResponse(MTP_OP_SEND_OBJECT_INFO, objectInfo);

    await this.sendCommand(MTP_OP_SEND_OBJECT, []);
    await this.sendDataAndReadResponse(MTP_OP_SEND_OBJECT, bytes);
  }

  private async deleteObject(handle: number) {
    await this.sendCommand(MTP_OP_DELETE_OBJECT, [handle, 0]);
    await this.readResponse([MTP_RESPONSE_OK]);
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
      40,
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
    await this.device.transferOut(this.endpointOut, container);
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
    await this.transferOutChunked(dataContainer);
    return await this.readResponse([MTP_RESPONSE_OK]);
  }

  private async readDataContainer(operation: number) {
    const container = await this.readContainer();
    const code = this.readUint16(container, 6);
    const type = this.readUint16(container, 4);

    if (type !== MTP_CONTAINER_DATA || code !== operation) {
      throw new Error(
        `Unexpected MTP data container: type=${type} code=0x${code.toString(16)}`,
      );
    }

    return container;
  }

  private async readResponse(acceptedCodes: number[]) {
    const container = await this.readContainer();
    const type = this.readUint16(container, 4);
    const code = this.readUint16(container, 6);

    if (type !== MTP_CONTAINER_RESPONSE || !acceptedCodes.includes(code)) {
      throw new Error(
        `Unexpected MTP response: type=${type} code=0x${code.toString(16)}`,
      );
    }

    const params: number[] = [];
    for (let offset = 12; offset + 4 <= container.byteLength; offset += 4) {
      params.push(this.readUint32(container, offset));
    }

    return { code, params };
  }

  private async readContainer() {
    const first = await this.device.transferIn(
      this.endpointIn,
      this.packetSize,
    );
    let buffer = new Uint8Array(first.data.buffer);
    const expectedLength = this.readUint32(buffer, 0);

    while (buffer.byteLength < expectedLength) {
      const next = await this.device.transferIn(
        this.endpointIn,
        this.packetSize,
      );
      buffer = this.concatArrays([buffer, new Uint8Array(next.data.buffer)]);
    }

    return buffer.slice(0, expectedLength);
  }

  private async transferOutChunked(bytes: Uint8Array) {
    for (let offset = 0; offset < bytes.byteLength; offset += this.packetSize) {
      await this.device.transferOut(
        this.endpointOut,
        bytes.slice(
          offset,
          Math.min(offset + this.packetSize, bytes.byteLength),
        ),
      );
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
    const container = new Uint8Array(length);
    const view = new DataView(container.buffer);
    view.setUint32(0, length, true);
    view.setUint16(4, type, true);
    view.setUint16(6, code, true);
    view.setUint32(8, transactionId, true);

    params.forEach((param, index) => {
      view.setUint32(12 + index * 4, param >>> 0, true);
    });

    if (payload) {
      container.set(payload, 12 + params.length * 4);
    }

    return container;
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
}
