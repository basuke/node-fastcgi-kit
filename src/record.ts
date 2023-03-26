import { Pairs } from './keyvalues';
import {
    alignedSize,
    dword,
    hiByte,
    hiWord,
    loByte,
    loWord,
    word,
} from './utils';
import { encode as encodePairs } from './keyvalues';

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

export enum Role {
    Responder = 1,
    Authorizer = 2,
    Filter = 3,
}

export class BeginRequestBody {
    readonly role: Role;
    readonly keepConnection: boolean;

    static bufferSize: number = 8;

    constructor(role: Role, keepConnection: boolean) {
        this.role = role;
        this.keepConnection = keepConnection;
    }

    get flags(): number {
        let value = 0;
        if (this.keepConnection) value |= 0x1;
        return value;
    }

    encode(): Buffer {
        const buffer = Buffer.allocUnsafe(BeginRequestBody.bufferSize);
        buffer[0] = hiByte(this.role);
        buffer[1] = loByte(this.role);
        buffer[2] = this.flags;
        return buffer;
    }

    static decode(buffer: Buffer): BeginRequestBody | null {
        if (buffer.byteLength !== BeginRequestBody.bufferSize) return null;
        const role = word(buffer[0], buffer[1]);
        const keepConnection = !!(buffer[2] & 0x1);
        return new BeginRequestBody(role, keepConnection);
    }
}

export class EndRequestBody {
    readonly appStatus: number;
    readonly protocolStatus: number;

    static bufferSize: number = 8;

    constructor(appStatus: number, protocolStatus: number) {
        this.appStatus = appStatus;
        this.protocolStatus = protocolStatus;
    }

    encode(): Buffer {
        const buffer = Buffer.allocUnsafe(BeginRequestBody.bufferSize);
        const val1 = hiWord(this.appStatus);
        const val2 = loWord(this.appStatus);
        buffer[0] = hiByte(val1);
        buffer[1] = loByte(val1);
        buffer[2] = hiByte(val2);
        buffer[3] = loByte(val2);
        buffer[4] = loByte(this.protocolStatus);
        return buffer;
    }

    static decode(buffer: Buffer): EndRequestBody | null {
        if (buffer.byteLength !== EndRequestBody.bufferSize) return null;
        const val1 = word(buffer[0], buffer[1]);
        const val2 = word(buffer[0], buffer[1]);
        const appStatus = dword(
            word(buffer[0], buffer[1]),
            word(buffer[2], buffer[3])
        );
        const protocolStatus = buffer[4];
        return new EndRequestBody(appStatus, protocolStatus);
    }
}

type EncodableBody = Buffer | BeginRequestBody | EndRequestBody | null;
export type RecordBody = EncodableBody | Pairs;

interface EncodableRecord {
    type: Type;
    requestId: number;
    body: EncodableBody;
}

export interface FCGIRecord {
    type: Type;
    requestId: number;
    body: RecordBody;
}

// 3. Records

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
    body: RecordBody = null
): FCGIRecord {
    return {
        type,
        requestId,
        body,
    };
}

function encodeBody(body: RecordBody): EncodableBody {
    if (!body || body instanceof Buffer) return body;

    if (body instanceof BeginRequestBody) {
        return body.encode();
    }

    if (body instanceof EndRequestBody) {
        return body.encode();
    }

    if (typeof body === 'object') {
        return encodePairs(body);
    }

    throw new Error(`Cannot encode body value: ${body}`);
}

function encodableRecord(record: FCGIRecord): EncodableRecord {
    if (!record.body || record.body instanceof Buffer) {
        return record as EncodableRecord;
    }
    return {
        type: record.type,
        requestId: record.requestId,
        body: encodeBody(record.body),
    };
}

export function setBody(
    { type, requestId, body: _ }: FCGIRecord,
    body: string | EncodableBody
): EncodableRecord {
    if (typeof body === 'string') {
        body = Buffer.from(body);
    }
    return { type, requestId, body };
}

function contentSize(record: EncodableRecord): number {
    if (record.body instanceof Buffer) {
        return record.body.byteLength;
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

    const record_ = encodableRecord(record);

    const length = contentSize(record_);
    if (length >= 0x10000) {
        throw new RangeError('body must be < 0x10000');
    }

    const withBody = !headerOnly && record_.body instanceof Buffer;
    const padding = paddingSize(length, alignment);

    const bufferSize = headerSize + (withBody ? length + padding : 0);
    const buffer = Buffer.alloc(bufferSize);

    buffer[0] = 1; // version
    buffer[1] = record_.type; // type
    buffer[2] = hiByte(record_.requestId); // requestId (Hi)
    buffer[3] = loByte(record_.requestId); // requestId (Lo)
    buffer[4] = hiByte(length); // contentLength (Hi)
    buffer[5] = loByte(length); // contentLength (Lo)
    buffer[6] = padding; // paddingLength
    buffer[7] = 0; // reserved

    if (
        !headerOnly &&
        record_.body instanceof Buffer &&
        record_.body.byteLength > 0
    ) {
        record_.body.copy(buffer, headerSize);
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

function decodeBody(type: Type, buffer: Buffer): RecordBody {
    switch (type) {
        case Type.FCGI_BEGIN_REQUEST:
            return BeginRequestBody.decode(buffer);
        case Type.FCGI_END_REQUEST:
            return EndRequestBody.decode(buffer);
        case Type.FCGI_PARAMS:
        case Type.FCGI_GET_VALUES:
        case Type.FCGI_GET_VALUES_RESULT:
        case Type.FCGI_ABORT_REQUEST:
        case Type.FCGI_UNKNOWN_TYPE:
        case Type.FCGI_STDIN:
        case Type.FCGI_STDOUT:
        case Type.FCGI_STDERR:
        case Type.FCGI_DATA:
            return buffer;
    }
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

    if (header.contentLength > 0) {
        const body = buffer.subarray(
            headerSize,
            headerSize + header.contentLength
        );
        return makeRecord(
            header.type,
            header.requestId,
            decodeBody(header.type, body)
        );
    } else {
        return makeRecord(header.type, header.requestId);
    }
}
