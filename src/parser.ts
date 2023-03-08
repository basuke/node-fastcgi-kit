import { FCGIHeaderLength, FCGIMaxBody } from './constants';
import { Record } from './record';

enum State {
    HEADER = 0,
    BODY,
    PADDING,
}

export interface Parser {
    fead(data: Buffer): void;
    on(event: 'record', listener: (record: Record) => void): void;
}

export function createParser() {
    return new ParserImpl();
}

export class ParserImpl {
    encoding: string = 'utf8';
    header: Buffer;
    body: Buffer;

    state: State = State.HEADER;
    loc: number = 0;
    record: Record = new Record();

    constructor() {
        this.header = Buffer.alloc(FCGIHeaderLength);
        this.body = Buffer.alloc(FCGIMaxBody);
    }

    reset() {
        this.state = State.HEADER;
        this.loc = 0;
        this.record = new Record();
    }

    execute(buffer: Buffer, start: number = 0, end: number | null = null) {}
}
