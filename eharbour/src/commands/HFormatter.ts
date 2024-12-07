import * as vscode from 'vscode';

const FullNames = new Map<string, string>([
	['sele', 'select'],
	['devi', 'device'],
	['scre', 'screen'],
	['comm', 'commit'],
]);

export class HarbourFormatter implements vscode.DocumentFormattingEditProvider {
	provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		// token: vscode.CancellationToken TODO: Зделать логику проверки отмены
	): vscode.TextEdit[] {
		const edits: vscode.TextEdit[] = [];
		const tabSize = options.tabSize || 4;
		const tab = ' '.repeat(tabSize);

		const selection = vscode.window.activeTextEditor?.selection;
		if (!selection) {
			return [];
		}

		// Получаем выделенные строки
		const startLine = selection.start.line;
		const endLine = selection.end.line;
		const selectedLines: string[] = [];
		for (let i = startLine; i <= endLine; i++) {
			selectedLines.push(document.lineAt(i).text);
		}

		const processedLines = this.parseAndRestoreMemvars(
			selectedLines.join('\n')
		).split('\n');

		const includeLines: { line: string; index: number }[] = [];
		let currentIndentLevel = 0;
		const formattedLines = processedLines.map((line, idx) => {
			const trimmedLine = line.trim();
			if (trimmedLine.startsWith('#include')) {
				includeLines.push({ line: trimmedLine, index: idx });
				return trimmedLine;
			}
			if (this.isClosingKeyword(trimmedLine)) {
				currentIndentLevel = Math.max(0, currentIndentLevel - 1);
			}
			const formattedLine = this.formatLine(
				trimmedLine,
				tab,
				currentIndentLevel
			);
			if (this.isOpeningKeyword(trimmedLine)) {
				currentIndentLevel++;
			}

			return formattedLine;
		});
		if (includeLines.length > 1) {
			const sortedIncludes = includeLines
				.map((item) => item.line)
				.sort((a, b) => a.localeCompare(b));

			includeLines.forEach((item, idx) => {
				if (item.line !== sortedIncludes[idx]) {
					const range = new vscode.Range(
						new vscode.Position(startLine + item.index, 0),
						new vscode.Position(startLine + item.index, item.line.length)
					);
					edits.push(vscode.TextEdit.replace(range, sortedIncludes[idx]));
				}
			});
		}

		formattedLines.forEach((line, idx) => {
			const originalLine = document.lineAt(startLine + idx);
			if (line !== originalLine.text) {
				const range = new vscode.Range(
					new vscode.Position(startLine + idx, 0),
					new vscode.Position(startLine + idx, originalLine.text.length)
				);
				edits.push(vscode.TextEdit.replace(range, line));
			}
		});

		return edits;
	}

	private formatLine(line: string, tab: string, indentLevel: number): string {
		const expanedKeyword = this.expandShortcuts(line);
		const formatted = this.formatOperators(this.formatKeywords(expanedKeyword));
		const indented = tab.repeat(indentLevel) + formatted;
		return indented.trimEnd();
	}

	private formatOperators(line: string): string {
		line = line.replace(/\s*(:?=\s*)\s*/g, ' := ');
		line = line.replace(/\s*([+\-*/%&|^~<>]=?)\s*/g, ' $1 ');
		line = line.replace(/,\s*/g, ', ');
		line = line.replace(/\s*(==|!=|<|>|<=|>=|&&|\|\|)\s*/g, ' $1 ');
		line = line.replace(/!\s+/g, '!');
		line = line.replace(/\s+function\b/g, 'function');
		line = line.replace(/\s*([+\-*/%&|^])\s*/g, ' $1 ');

		return line;
	}

	private parseMemVarsFrom(lines: string[]): string[][] {
		const result: string[][] = [];

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (trimmedLine.startsWith('memvar ')) {
				const vars = trimmedLine
					.replace('memvar', '')
					.split(',')
					.map((v) => v.trim()) // Убираем пробелы
					.filter((v) => v.length > 0); // Игнорируем пустые переменные
				if (vars.length > 0) {
					result.push(vars);
				}
			}
		}
		return result;
	}

	private removeDuplicates(memvarBlocks: string[][]): string[][] {
		const uniqueValues = new Set<string>();
		const deduplicatedBlocks: string[][] = [];

		for (const block of memvarBlocks) {
			const deduplicatedBlock = block.filter((varName) => {
				if (uniqueValues.has(varName)) {
					return false; // Пропускаем дубликаты
				} else {
					uniqueValues.add(varName); // Добавляем уникальные
					return true;
				}
			});
			deduplicatedBlocks.push(deduplicatedBlock);
		}

		return deduplicatedBlocks;
	}

	private restoreBlocks(
		deduplicatedBlocks: string[][],
		lines: string[]
	): string[] {
		const processedLines: string[] = [];
		let blockIndex = 0;

		for (const line of lines) {
			const trimmedLine = line.trimEnd();

			if (trimmedLine.startsWith('memvar')) {
				if (
					blockIndex < deduplicatedBlocks.length &&
					deduplicatedBlocks[blockIndex].length > 0
				) {
					const restoredVars = deduplicatedBlocks[blockIndex].join(', ');
					processedLines.push(`memvar ${restoredVars}`);
				}
				blockIndex++;
			} else {
				processedLines.push(trimmedLine); // Оставляем строки без изменений
			}
		}

		return processedLines;
	}

	private parseAndRestoreMemvars(input: string): string {
		const lines = input.split('\n');
		const memvarBlocks = this.parseMemVarsFrom(lines);
		const deduplicatedBlocks = this.removeDuplicates(memvarBlocks);
		return this.restoreBlocks(deduplicatedBlocks, lines).join('\n');
	}

	private expandShortcuts(line: string): string {
		for (const [shortName, fullName] of FullNames) {
			const regex = new RegExp(`\\b${shortName}\\b`, 'gi');
			line = line.replace(regex, fullName);
		}
		return line;
	}

	private formatKeywords(line: string): string {
		const keywords = [
			'if',
			'else',
			'endif',
			'for',
			'do while',
			'return',
			'private',
			'procedure',
			'static',
			'local',
			'as',
			'array',
			'enddo',
		];

		for (const keyword of keywords) {
			const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
			line = line.replace(regex, keyword.toLowerCase());
		}

		return line;
	}

	private isOpeningKeyword(line: string): boolean {
		const openingKeywords = ['if', 'for', 'do while', 'private', 'procedure'];
		return openingKeywords.some((keyword) =>
			line.toLowerCase().startsWith(keyword)
		);
	}

	private isClosingKeyword(line: string): boolean {
		const closingKeywords = ['endif', 'return', 'enddo'];
		return closingKeywords.some((keyword) =>
			line.toLowerCase().startsWith(keyword)
		);
	}
}
