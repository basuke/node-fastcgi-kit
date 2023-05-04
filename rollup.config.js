const esbuild = require('rollup-plugin-esbuild')

const name = 'dist/index';
console.log(esbuild);

const bundle = config => ({
    ...config,
    input: 'src/index.ts',
    external: id => !/^[./]/.test(id),
})

module.exports = [
    bundle({
        plugins: [esbuild.default()],
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