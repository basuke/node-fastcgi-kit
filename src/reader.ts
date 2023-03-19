import { decodableSize, decode, FCGIRecord, Type } from './record';
import { Writable } from 'node:stream';
import { decode as decodePairs, Pairs } from './keyvalues';

export class Reader extends Writable {
    remaining: Buffer | null = null;

    // Param stream
    params: [Buffer | null, Pairs] | null = null;

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
        if (record.type === Type.FCGI_PARAMS) {
            return this.decodeParams(record);
        } else {
            if (this.params) {
                this.emit(
                    'error',
                    new Error(
                        'Reader::decodeRecord: Cannot receive other record while processing FCGI_PARAMS stream.'
                    )
                );
                return null;
            }
            return record;
        }
    }

    decodeParams(record: FCGIRecord): FCGIRecord | null {
        const [leftover, pairs] = this.params ?? [null, {}];
        this.params = null;

        if (record.body instanceof Buffer) {
            const buffer = leftover
                ? Buffer.concat([leftover, record.body])
                : record.body;
            const remaining = decodePairs(buffer, pairs);
            if (Object.keys(pairs).length > 0 || remaining) {
                this.params = [remaining, pairs];
                return null;
            }
        }

        record.body = pairs;
        return record;
    }
}
