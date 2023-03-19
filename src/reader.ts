import { decodableSize, decode, FCGIRecord, Type } from './record';
import { Writable } from 'node:stream';
import { decode as decodePairs, Pairs } from './keyvalues';

export class Reader extends Writable {
    remaining: Buffer | null = null;

    // Param stream
    params: Pairs | null = null;

    _write(
        chunk: Buffer,
        _: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
    ): void {
        if (this.remaining) {
            chunk = Buffer.concat([this.remaining, chunk]);
            this.remaining = null;
        }

        while (chunk.byteLength > 0) {
            const length = decodableSize(chunk);
            if (!length || length > chunk.byteLength) {
                this.remaining = chunk;
                break;
            }
            const record = this.decodeRecord(chunk.subarray(0, length));
            chunk = chunk.subarray(length);
            if (record) {
                this.emit('record', record);
            }
        }
        callback();
    }

    decodeRecord(chunk: Buffer): FCGIRecord | null {
        const record = decode(chunk);
        switch (record.type) {
            case Type.FCGI_PARAMS:
                return this.decodeParams(record);
        }
        return record;
    }

    decodeParams(record: FCGIRecord): FCGIRecord | null {
        const pairs: Pairs = this.params ?? {};
        this.params = null;

        if (record.body instanceof Buffer) {
            decodePairs(record.body, pairs);
            if (Object.keys(pairs).length > 0) {
                this.params = pairs;
                return null;
            }
        }

        record.body = pairs;
        return record;
    }
}
