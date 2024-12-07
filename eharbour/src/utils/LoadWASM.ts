import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma-wasm';
import * as vsTextmate from 'vscode-textmate';

export async function loadWASM(): Promise<vsTextmate.IOnigLib> {
	const wasmPath = path.join(__dirname, './oniguruma/onig.wasm');

	const wasmBin = await readFile(wasmPath);
	const vscodeOnigurumaLibPromise = oniguruma.loadWASM(wasmBin).then(() => {
		return {
			createOnigScanner(patterns: string[]) {
				return new oniguruma.OnigScanner(patterns);
			},
			createOnigString(s: string) {
				return new oniguruma.OnigString(s);
			},
		};
	});
	return vscodeOnigurumaLibPromise;
}

async function readFile(path: string) {
	try {
		return (await fs.promises.readFile(path)).buffer;
	} catch (error) {
		console.error(`Error reading file: ${error}`);
		throw error;
	}
}
