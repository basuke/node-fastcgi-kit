import { FCGIRecord } from './record';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';

export function encodeRecord(record: FCGIRecord): Buffer {
    let size = 8;
    if (record.body) {
    }
    const buffer = Buffer.alloc(size);
}

export interface Encoder {
    feed(record: FCGIRecord): void;
    on(event: 'data', listener: (blob: Buffer) => void): void;
}

export function createEncoder(): Encoder {
    return new EncoderImpl();
}

export class EncoderImpl extends EventEmitter implements Encoder {
    feed(record: FCGIRecord): void {
        this.emit('data', 'hello');
    }
}
