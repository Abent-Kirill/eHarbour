import * as vscode from 'vscode';

export class HbDefaultCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.CodeAction[]> {
		const actions: vscode.CodeAction[] = [];

		// Проверяем, является ли строка, на которой стоит курсор, неправильным вызовом hb_Default
		const lineText = document.lineAt(range.start.line).text;
		const regex = /hb_Default\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,/g;
		const match = regex.exec(lineText);

		if (match && match[1] && !lineText.includes('@')) {
			// Создаём действие для добавления @
			const action = new vscode.CodeAction(
				`Add '@' to parameter '${match[1]}' in hb_Default`,
				vscode.CodeActionKind.QuickFix
			);

			// Указываем, что будет сделано при выборе этой подсказки
			action.edit = new vscode.WorkspaceEdit();
			const startPos = new vscode.Position(
				range.start.line,
				match.index + match[0].indexOf(match[1])
			);
			const endPos = new vscode.Position(
				range.start.line,
				startPos.character + match[1].length
			);
			action.edit.replace(
				document.uri,
				new vscode.Range(startPos, endPos),
				`@${match[1]}`
			);

			actions.push(action);
		}

		return actions;
	}
}
