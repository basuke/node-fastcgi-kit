import { alignedSize, hiByte, loByte, word } from './utils';
import { Readable } from 'node:stream';

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

const headerSize = 8;

export type ReadableWithLength = {
    length: number;
    stream: Readable;
};

export interface FCGIRecord {
    type: Type;
    requestId: number;
    body: Buffer | ReadableWithLength | null;
}

export interface Header {
    version: number;
    type: Type;
    requestId: number;
    contentLength: number;
    paddingLength: number;
}

export function makeRecord(
    type: Type,
    requestId: number = 0,
    body: Buffer | ReadableWithLength | null = null
): FCGIRecord {
    return {
        type,
        requestId,
        body,
    };
}

export function setBody(
    record: FCGIRecord,
    body: string | Buffer | ReadableWithLength | null
): void {
    if (typeof body === 'string') {
        record.body = Buffer.from(body);
    } else {
        record.body = body;
    }
}

export function contentSize(record: FCGIRecord): number {
    const body = record.body;
    if (!body) return 0;
    if (body instanceof Buffer) {
        return body.byteLength;
    }
    return body.length;
}

export function getStream(record: FCGIRecord): ReadableWithLength | null {
    return record.body &&
        typeof record.body === 'object' &&
        'stream' in record.body
        ? record.body
        : null;
}

export function paddingSize(record: FCGIRecord, alignment: number): number {
    const length = contentSize(record);
    const totalSize = headerSize + length;
    return alignedSize(totalSize, alignment) - totalSize;
}

export function encode(
    record: FCGIRecord,
    alignment: number = defaultAlignment
): Buffer {
    if (alignment > 256) {
        throw new RangeError('alignment must be <= 256');
    }

    const length = contentSize(record);
    if (length >= 0x10000) {
        throw new RangeError('body must be < 0x10000');
    }

    const withBody = record.body instanceof Buffer;
    const padding = paddingSize(record, alignment);

    const bufferSize = headerSize + (withBody ? length + padding : 0);
    const buffer = Buffer.alloc(bufferSize);

    buffer[0] = 1; // version
    buffer[1] = record.type; // type
    buffer[2] = hiByte(record.requestId); // requestId (Hi)
    buffer[3] = loByte(record.requestId); // requestId (Lo)
    buffer[4] = hiByte(length); // contentLength (Hi)
    buffer[5] = loByte(length); // contentLength (Lo)
    buffer[6] = padding; // paddingLength
    buffer[7] = 0; // reserved

    if (record.body instanceof Buffer && record.body.byteLength > 0) {
        record.body.copy(buffer, headerSize);
    }

    return buffer;
}

export function decodeHeader(buffer: Buffer): Header | undefined {
    if (buffer.byteLength < headerSize) {
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
    return headerSize + header.contentLength + header.paddingLength;
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

    const record = makeRecord(header.type);
    record.requestId = header.requestId;
    if (header.contentLength > 0) {
        setBody(
            record,
            buffer.subarray(headerSize, headerSize + header.contentLength)
        );
    }
    return record;
}
