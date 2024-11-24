import * as vscode from 'vscode';
import { registerFormatCommand } from './commands/Format';
import { IFormatterConfiguration } from './types/IFormatterConfiguration';
import { loadWASM } from './utils/LoadWASM';
const formatterConfiguration: IFormatterConfiguration = {
	replace: {
		cycle: true,
		logical: true,
		methods: true,
	},
};
export async function activate(context: vscode.ExtensionContext) {
	const wasm = loadWASM();
	registerFormatCommand(context, formatterConfiguration, wasm);
}

export function deactivate() {}
