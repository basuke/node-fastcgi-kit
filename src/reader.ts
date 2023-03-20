import { decodableSize, decode, FCGIRecord, Type } from './record';
import { Writable } from 'node:stream';
import {
    decode as decodePairs,
    Pairs,
    StreamDecoder as ParamsDecoder,
    StreamDecoder,
} from './keyvalues';

export class Reader extends Writable {
    remaining: Buffer | null = null;

    // Param stream
    paramsDecoders: Map<number, ParamsDecoder> = new Map();

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
            if (this.paramsDecoders.has(record.requestId)) {
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

    paramsDecoderForRecord(record: FCGIRecord): ParamsDecoder {
        if (this.paramsDecoders.has(record.requestId)) {
            return this.paramsDecoders.get(record.requestId) as StreamDecoder;
        } else {
            const decoder = new ParamsDecoder();
            this.paramsDecoders.set(record.requestId, decoder);
            return decoder;
        }
    }

    decodeParams(record: FCGIRecord): FCGIRecord | null {
        const decoder = this.paramsDecoderForRecord(record);

        if (record.body instanceof Buffer) {
            decoder.decode(record.body);
            return null;
        } else if (decoder.canClose) {
            record.body = decoder.pairs;
            this.paramsDecoders.delete(record.requestId);
            return record;
        } else {
            const message =
                'decodeParams: Incomplete pairs. Cannot close stream';
            this.emit('error', new Error(message));
            return null;
        }
    }
}
