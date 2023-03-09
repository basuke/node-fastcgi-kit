export function alignedSize(size: number, alignment: number): number {
    return Math.floor((size + alignment - 1) / alignment) * alignment;
}

export function hiByte(val: number): number {
    return val >> 8;
}

export function loByte(val: number): number {
    return val & 0xff;
}
