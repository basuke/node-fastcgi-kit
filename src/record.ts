import { Pairs } from './keyvalues';
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
export const maxContentLength = 0xffff;
export const maxAlignment = 256;
export const headerSize = 8;

type EncodableBody = Buffer | null;

export interface FCGIRecord {
    type: Type;
    requestId: number;
    body: EncodableBody | Pairs;
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
    body: EncodableBody | Pairs = null
): FCGIRecord {
    return {
        type,
        requestId,
        body,
    };
}

export function setBody(
    record: FCGIRecord,
    body: string | EncodableBody
): void {
    if (typeof body === 'string') {
        record.body = Buffer.from(body);
    } else {
        record.body = body;
    }
}

export function contentSize(record: FCGIRecord): number {
    if (record.body instanceof Buffer) {
        return record.body.byteLength;
    } else if (record.body && typeof record.body === 'object') {
        throw new TypeError(
            'contentSize(): cannot encode key value pairs directly'
        );
    }
    return 0;
}

export function paddingSize(contentLength: number, alignment: number): number {
    const totalSize = headerSize + contentLength;
    return alignedSize(totalSize, alignment) - totalSize;
}

export function encode(
    record: FCGIRecord,
    alignment: number = defaultAlignment,
    headerOnly: boolean = false
): Buffer {
    if (alignment > maxAlignment) {
        throw new RangeError(`alignment must be <= ${maxAlignment}`);
    }

    const length = contentSize(record);
    if (length >= 0x10000) {
        throw new RangeError('body must be < 0x10000');
    }

    const withBody = !headerOnly && record.body instanceof Buffer;
    const padding = paddingSize(length, alignment);

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

    if (
        !headerOnly &&
        record.body instanceof Buffer &&
        record.body.byteLength > 0
    ) {
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
