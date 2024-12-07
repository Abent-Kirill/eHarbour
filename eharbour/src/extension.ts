import * as vscode from 'vscode';
import { HarbourFormatter } from './commands/HFormatter';
import { HbDefaultCodeActionProvider } from './Providers/HbDefaultCodeActionProvider';
const diagnosticCollection =
	vscode.languages.createDiagnosticCollection('harbour');

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			'harbour',
			new HarbourFormatter()
		)
	);
	context.subscriptions.push(diagnosticCollection);

	vscode.workspace.onDidChangeTextDocument((event) => {
		const diagnostics: vscode.Diagnostic[] = [];
		const text = event.document.getText();

		const invalidDefaults = findInvalidHbDefaults(text);
		invalidDefaults.forEach((ref) => {
			const range = new vscode.Range(
				ref.line,
				ref.startChar,
				ref.line,
				ref.endChar
			);

			const diagnostic = new vscode.Diagnostic(
				range,
				`The parameter '${ref.variable}' should be passed with '@' in hb_Default.`,
				vscode.DiagnosticSeverity.Error
			);

			// Добавляем код исправления
			diagnostic.code = {
				value: 'fixHbDefaultParameter',
				target: vscode.Uri.parse('command:harbour.fixHbDefaultParameter'),
			};

			diagnostics.push(diagnostic);
		});

		diagnosticCollection.set(event.document.uri, diagnostics);
	});

	vscode.languages.registerCodeActionsProvider(
		'harbour',
		new HbDefaultCodeActionProvider()
	);
}

function findInvalidHbDefaults(
	text: string
): { variable: string; line: number; startChar: number; endChar: number }[] {
	const results: {
		variable: string;
		line: number;
		startChar: number;
		endChar: number;
	}[] = [];
	const lines = text.split('\n');

	lines.forEach((line, lineNumber) => {
		const regex = /hb_Default\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,/g;
		let match;
		while ((match = regex.exec(line)) !== null) {
			const variable = match[1];
			const startChar = match.index + match[0].indexOf(variable);
			const endChar = startChar + variable.length;

			if (!line.substring(startChar - 1, startChar).includes('@')) {
				results.push({ variable, line: lineNumber, startChar, endChar });
			}
		}
	});

	return results;
}
