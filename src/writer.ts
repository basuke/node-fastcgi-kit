import { encode, FCGIRecord, defaultAlignment } from './record';
import { Writable } from 'node:stream';

export interface Writer {
    alignment: number;
    write: (record: FCGIRecord) => void;
}

class WriterImpl implements Writer {
    writable: Writable;
    alignment: number;

    constructor(writable: Writable, alignment: number) {
        this.writable = writable;
        this.alignment = alignment;
    }

    write(record: FCGIRecord) {
        const buffer = encode(record, this.alignment);
        this.writable.write(buffer);
    }
}

export function createWriter(
    writable: Writable,
    alignment: number = defaultAlignment
): Writer {
    return new WriterImpl(writable, alignment);
}
