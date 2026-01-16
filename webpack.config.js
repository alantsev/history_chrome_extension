
import path from 'path';
import { fileURLToPath } from 'url';

import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
    mode: 'development',
    devtool: 'inline-source-map',
    entry: {
        'background/worker': './src/background/worker.js',
        'db/database': './src/db/database.js',
        'popup/debug': './src/popup/debug.js',
        'popup/popup': './src/popup/popup.js',
        'visualisation/visualisation': './src/visualisation/visualisation.js'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js',
        pathinfo: true,
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: "public",
                    to: "."
                },
                {
                    from: "./src/content/page_data_collector.js",
                    to: "./content/page_data_collector.js"
                },
                {
                    from: "./src/content/content.js",
                    to: "./content/content.js"
                },
                {
                    from: "./node_modules/@xenova/transformers/dist/*.wasm",
                    to: "./lib/[name][ext]"
                },
            ],
        })
    ],
};

export default config;

