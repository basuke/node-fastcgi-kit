import { alignedSize, hiByte, loByte, word } from './utils';

export enum Type {
    FCGI_BEGIN_REQUEST = 1,
    FCGI_ABORT_REQUEST,
    FCGI_END_REQUEST,
    FCGI_PARAMS,
    FCGI_STDIN,
    FCGI_STDOUT,
    FCGI_STDERR,
    FCGI_DATA,
    FCGI_GET_VALUES,
    FCGI_GET_VALUES_RESULT,
    FCGI_UNKNOWN_TYPE,
}

export const defaultAlignment = 8;

export interface FCGIRecord {
    type: Type;
    requestId: number;
    body: Buffer | null;
}

export interface Header {
    version: number;
    type: Type;
    requestId: number;
    contentLength: number;
    paddingLength: number;
}

export function makeRecord(type: Type): FCGIRecord {
    return {
        type,
        requestId: 0,
        body: null,
    };
}

export function setBody(
    record: FCGIRecord,
    body: string | Buffer | null
): void {
    if (typeof body === 'string') {
        record.body = Buffer.from(body);
    } else {
        record.body = body;
    }
}

export function encodedSize(record: FCGIRecord): number {
    let size = 8;
    if (record.body) {
        size += record.body.byteLength;
    }
    return size;
}

export function encode(
    record: FCGIRecord,
    alignment: number = defaultAlignment
): Buffer {
    if (alignment > 256) {
        throw new RangeError('alignment > 256');
    }

    const size = encodedSize(record);
    const padding = alignedSize(size, alignment) - size;
    const buffer = Buffer.alloc(size + padding);
    const length = record.body ? record.body.byteLength : 0;

    if (length >= 0x10000) {
        throw new RangeError('body must be < 0x10000');
    }

    buffer[0] = 1; // version
    buffer[1] = record.type; // type
    buffer[2] = hiByte(record.requestId); // requestId (Hi)
    buffer[3] = loByte(record.requestId); // requestId (Lo)
    buffer[4] = hiByte(length); // contentLength (Hi)
    buffer[5] = loByte(length); // contentLength (Lo)
    buffer[6] = padding; // paddingLength
    buffer[7] = 0; // reserved

    if (record.body) {
        record.body.copy(buffer, 8);
    }

    return buffer;
}

export function decodeHeader(buffer: Buffer): Header | undefined {
    if (buffer.byteLength < 8) {
        return undefined;
    }
    const version = buffer[0];
    const type = buffer[1];
    const requestId = word(buffer[2], buffer[3]);
    const contentLength = word(buffer[4], buffer[5]);
    const paddingLength = buffer[6];
    const reserved = buffer[7];
    return {
        version,
        type,
        requestId,
        contentLength,
        paddingLength,
    };
}

function recordSize(header: Header): number {
    return 8 + header.contentLength + header.paddingLength;
}

export function decodableSize(buffer: Buffer): number | undefined {
    const header = decodeHeader(buffer);
    if (!header) {
        return undefined;
    }
    const expectedSize = recordSize(header);
    return buffer.byteLength >= expectedSize ? expectedSize : undefined;
}

export function decode(buffer: Buffer): FCGIRecord {
    const header = decodeHeader(buffer);
    if (!header) {
        throw new RangeError('buffer too short');
    }
    const expectedSize = recordSize(header);
    if (buffer.byteLength < expectedSize) {
        throw new RangeError('buffer too short');
    }
    return makeRecord(header.type);
}
