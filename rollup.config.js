const typescript = require('@rollup/plugin-typescript');


const bundle = config => ({
    ...config,
    input: 'src/index.ts',
    external: id => !/^[./]/.test(id),
})

module.exports = [
    bundle({
        plugins: [typescript.default(),],
        output: [
            {
                file: `dist/index.js`,
                format: 'cjs',
                sourcemap: true,
            },
            {
                file: `dist/esm/index.mjs`,
                format: 'es',
                sourcemap: true,
            },
        ],
    }),
]