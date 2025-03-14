
import path from 'path';
import { fileURLToPath } from 'url';

import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
    mode: 'development',
    devtool: 'inline-source-map',
    entry: {
        'content/content': './src/content/content.js',
        'background/worker': './src/background/worker.js'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js',
        pathinfo: true
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup/popup.html',
            filename: 'popup/popup.html',
            pathinfo: true
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: "public",
                    to: "." // Copies to build folder
                },
            ],
        })
    ],
};

export default config;

