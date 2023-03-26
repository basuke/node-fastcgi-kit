import { Duplex, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

export function alignedSize(size: number, alignment: number): number {
    return Math.floor((size + alignment - 1) / alignment) * alignment;
}

export function hiByte(val: number): number {
    return loByte(val >> 8);
}

export function loByte(val: number): number {
    return val & 0xff;
}

export function word(hi: number, lo: number): number {
    return (hi << 8) + lo;
}

export function hiWord(val: number): number {
    return loWord(val >> 16);
}

export function loWord(val: number): number {
    return val & 0xffff;
}

export function dword(hi: number, lo: number): number {
    return (hi << 16) + lo;
}

export function bytestr(
    strs: TemplateStringsArray,
    ...exprs: (string | number | number[])[]
): Buffer {
    const bytes = [];
    for (let str of strs) {
        while (str.length > 0) {
            str = str.trim();
            if (str) {
                const twoDigits = str.substring(0, 2);
                if (!twoDigits.match(/[0-9A-Fa-f]{2}/)) {
                    throw new SyntaxError('invalid hex digits');
                }
                str = str.substring(2);
                bytes.push(parseInt(twoDigits, 16));
            }
        }

        if (exprs.length > 0) {
            let expr = exprs[0];
            exprs.shift();

            if (typeof expr === 'number') {
                expr = [expr];
            }
            const buffer = Buffer.from(expr);
            for (const value of buffer) {
                bytes.push(value);
            }
        }
    }
    return Buffer.from(bytes);
}

export function tick() {
    return new Promise((resolve) => {
        setTimeout(resolve, 17);
    });
}

export class StreamPair extends Duplex {
    static create() {
        const a = new StreamPair();
        const b = new StreamPair();

        a.other = b;
        b.other = a;

        return [a, b];
    }

    buffer: PassThrough = new PassThrough();
    other: StreamPair | null = null;

    constructor() {
        super();

        this.once('finish', () => {
            if (this.other) {
                this.other.buffer.end();
            }
        });

        this.buffer.once('end', () => this.push(null));
    }

    _read() {
        const chunk = this.buffer.read();
        if (chunk) return this.push(chunk);

        this.buffer.once('readable', () => this._read());
    }

    _write(data: any, enc: BufferEncoding, cb: any) {
        if (this.other) {
            this.other.buffer.write(data, enc, cb);
        }
    }
}

export function once<T>(
    target: EventEmitter,
    event: string,
    timeout: number | undefined
): Promise<T> {
    return new Promise((resolve, reject) => {
        const listener = (values: T) => {
            resolve(values);
            clearTimeout(ticket);
        };

        target.once(event, listener);

        const ticket = setTimeout(() => {
            target.removeListener(event, listener);
            reject(
                new Error(
                    `Timeout: cannot receive value record in ${timeout} ms`
                )
            );
        }, timeout);
    });
}

export class MinBag {
    maxIssued: number = 0;
    available: number[] = [];
    readonly needCheck: boolean;

    constructor(needCheck: boolean = false) {
        this.needCheck = needCheck;
    }

    issue(): number {
        if (this.available.length > 0) {
            return this.available.shift() as number;
        }

        const id = ++this.maxIssued;
        if (this.needCheck) this.check();
        return id;
    }

    putBack(id: number) {
        if (id <= 0 || id > this.maxIssued) {
            throw new Error('Invalid id was returned');
        }

        if (id === this.maxIssued) {
            this.maxIssued--;
        } else {
            this.available.push(id);
        }

        if (this.needCheck) this.check();
    }

    check(): void {
        for (const id of this.available) {
            if (id >= this.maxIssued) {
                throw new Error(
                    `invalid id is in 'available': ${id} > maxIssued(${this.maxIssued})`
                );
            }
        }
    }
}
