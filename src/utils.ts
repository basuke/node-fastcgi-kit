export function alignedSize(size: number, alignment: number): number {
    return Math.floor((size + alignment - 1) / alignment) * alignment;
}

export function hiByte(val: number): number {
    return val >> 8;
}

export function loByte(val: number): number {
    return val & 0xff;
}

export function bytestr(
    strs: TemplateStringsArray,
    ...exprs: (string | number | number[])[]
): Buffer {
    const bytes = [];
    for (let str of strs) {
        while (str.length > 0) {
            str = str.trim();
            const twoDigits = str.substring(0, 2);
            if (!twoDigits.match(/[0-9A-Fa-f]{2}/)) {
                throw new SyntaxError('invalid hex digits');
            }
            str = str.substring(2);
            bytes.push(parseInt(twoDigits, 16));
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
