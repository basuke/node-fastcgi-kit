import { Record } from './record';
import EventEmitter from 'events';

export interface Encoder {
    feed(record: Record): void;
    on(event: 'data', listener: (blob: Buffer) => void): void;
}

export function createEncoder(): Encoder {
    return new EncoderImpl();
}

export class EncoderImpl extends EventEmitter implements Encoder {
    feed(record: Record): void {
        this.emit('data', 'hello');
    }
}
