import { alignedSize, hiByte, loByte } from './utils';

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

export class Record {
    type: Type;
    requestId: number = 0;
    body: Buffer | null = null;

    constructor(type: Type) {
        this.type = type;
    }

    setBody(body: string | Buffer | null) {
        if (typeof body === 'string') {
            this.body = Buffer.from(body);
        } else {
            this.body = body;
        }
    }

    encodedSize(): number {
        let size = 8;
        if (this.body) {
            size += this.body.byteLength;
        }
        return size;
    }

    encode(alignment: number): Buffer {
        if (alignment > 256) {
            throw new RangeError('alignment > 256');
        }

        const size = this.encodedSize();
        const padding = alignedSize(size, alignment) - size;
        const buffer = Buffer.alloc(size + padding);
        const length = this.body ? this.body.byteLength : 0;

        if (length >= 0x10000) {
            throw new RangeError('body must be < 0x10000');
        }

        buffer[0] = 1; // version
        buffer[1] = this.type; // type
        buffer[2] = hiByte(this.requestId); // requestId (Hi)
        buffer[3] = loByte(this.requestId); // requestId (Lo)
        buffer[4] = hiByte(length); // contentLength (Hi)
        buffer[5] = loByte(length); // contentLength (Lo)
        buffer[6] = padding; // paddingLength
        buffer[7] = 0; // reserved

        if (this.body) {
            this.body.copy(buffer, 8);
        }

        return buffer;
    }
}
