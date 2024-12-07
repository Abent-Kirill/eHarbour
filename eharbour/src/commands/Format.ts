// import * as fs from 'fs';
// import * as path from 'path';
// import * as vscode from 'vscode';
// import * as vsTextmate from 'vscode-textmate';
// import { ScopeName } from 'vscode-textmate/release/theme';
// import { IFormatterConfiguration } from '../types/IFormatterConfiguration';
// import { IMetaContext } from '../types/IMetaContext';
// import { ISpaceCorrectorInfo } from '../types/ISpaceCorrectorInfo';
// import * as Line from '../types/Line';
// import { LineTypes } from '../types/LineTypes';
// import { TypeBlockCode } from '../types/TypeBlockCode';

// const FullNames = new Map<string, string>([
// 	['sele', 'select'],
// 	['select', 'select'],
// 	['devi', 'device'],
// 	['device', 'device'],
// 	['scre', 'screen'],
// 	['screen', 'screen'],
// 	['comm', 'commit'],
// 	['commit', 'commit'],
// ]);

// export function registerFormatCommand(
// 	context: vscode.ExtensionContext,
// 	formatterConfiguration: IFormatterConfiguration,
// 	vscodeOnigurumaLibPromise: Promise<vsTextmate.IOnigLib>,
// 	spaceCount: number
// ): void {
// 	const eHarbourFormatCommand = vscode.commands.registerCommand(
// 		'eHarbour.format',
// 		async () => {
// 			const editor = vscode.window.activeTextEditor;

// 			if (!editor) {
// 				vscode.window.showErrorMessage('Нет открытого текстового редактора.');
// 				return;
// 			}

// 			const document = editor.document;
// 			const selection = editor.selection;

// 			const selectedCode: vscode.Selection = selection.isEmpty
// 				? new vscode.Selection(
// 						new vscode.Position(selection.start.line, 0),
// 						new vscode.Position(selection.end.line, 0)
// 				  )
// 				: selection;

// 			const text = document.getText(selectedCode);
// 			try {
// 				vscode.window.showInformationMessage(
// 					'Начат процесс форматирования кода...'
// 				);

// 				const formattedText = await getFormattedDoc(
// 					text,
// 					document,
// 					formatterConfiguration,
// 					vscodeOnigurumaLibPromise
// 				);
// 				const edit = new vscode.WorkspaceEdit();

// 				if (text !== formattedText) {
// 					await editor.edit((editBuilder) => {
// 						editBuilder.replace(editor.selection, formattedText);
// 					});
// 					await vscode.workspace.applyEdit(edit);
// 					vscode.window.showInformationMessage('Код успешно отформатирован.');
// 				} else {
// 					vscode.window.showInformationMessage(
// 						'Форматирование не внесло изменений в код.'
// 					);
// 				}
// 			} catch (error) {
// 				vscode.window.showErrorMessage(
// 					`Ошибка форматирования: ${(error as Error).message}`
// 				);
// 			}
// 		}
// 	);

// 	context.subscriptions.push(eHarbourFormatCommand);
// }

// function parseMemVarsFrom(lines: string[]): string[][] {
// 	const result: string[][] = [];

// 	for (const line of lines) {
// 		const trimmedLine = line.trimEnd();
// 		if (trimmedLine.startsWith('memvar')) {
// 			const vars = trimmedLine
// 				.replace('memvar', '')
// 				.split(',')
// 				.map((v) => v.trimEnd());
// 			if (vars.length > 0) {
// 				result.push(vars);
// 			}
// 			continue;
// 		}
// 	}
// 	return result;
// }

// function removeDuplicates(memvarBlocks: string[][]): string[][] {
// 	const uniqueValues = new Set<string>();

// 	return memvarBlocks.map((block) =>
// 		block.filter((varName) =>
// 			uniqueValues.has(varName) ? false : uniqueValues.add(varName)
// 		)
// 	);
// }

// function restoreBlocks(
// 	deduplicatedBlocks: string[][],
// 	lines: string[]
// ): string[] {
// 	const processedLines: string[] = [];
// 	let blockIndex = 0;

// 	for (const line of lines) {
// 		const trimmedLine = line.trimEnd();

// 		if (trimmedLine.startsWith('memvar')) {
// 			processedLines.push(
// 				blockIndex < deduplicatedBlocks.length
// 					? `memvar${deduplicatedBlocks[blockIndex++].join(',')}`
// 					: line
// 			);
// 		} else {
// 			processedLines.push(trimmedLine);
// 		}
// 	}

// 	return processedLines;
// }

// function parseAndRestoreMemvars(input: string): string {
// 	return restoreBlocks(
// 		removeDuplicates(parseMemVarsFrom(input.split('\n'))),
// 		input.split('\n')
// 	).join('\n');
// }

// async function getFormattedDoc(
// 	code: string,
// 	document: vscode.TextDocument,
// 	harbour: IFormatterConfiguration,
// 	vscodeOnigurumaLibPromise: Promise<vsTextmate.IOnigLib>
// ): Promise<string> {
// 	const registry = new vsTextmate.Registry({
// 		onigLib: vscodeOnigurumaLibPromise,
// 		loadGrammar: async (
// 			scopeName: ScopeName
// 		): Promise<vsTextmate.IRawGrammar | undefined | null> => {
// 			if (scopeName === 'source.harbour') {
// 				try {
// 					const fileName = path.join(
// 						__dirname,
// 						'./syntaxes/harbour.tmLanguage.json'
// 					);
// 					const data: Buffer = await fs.promises.readFile(fileName);
// 					return vsTextmate.parseRawGrammar(data.toString(), fileName);
// 				} catch (ex) {
// 					console.error(ex);
// 				}
// 			}
// 			return null;
// 		},
// 	});

// 	const configuration = vscode.workspace.getConfiguration('eharbour');
// 	const proceduresName = configuration.get<string[]>('proceduresname', []);
// 	const replaceLogical = harbour.replace.logical;
// 	const replaceCycle = harbour.replace.cycle;
// 	const replaceMethods = harbour.replace.methods;
// 	const procsFileName = path.join(__dirname, './syntaxes/HarbourProcsExt.txt');
// 	const procsData: string = fs.readFileSync(procsFileName, 'utf8');
// 	const procs = procsData.replaceAll('\r', '').split('\n');
// 	const procsHash = new Map<string, string>();

// 	for (let i = 0; i < procs.length; i++) {
// 		const line: string = procs[i];
// 		if (line) {
// 			procsHash.set(line.toLowerCase(), line);
// 		}
// 	}

// 	if (proceduresName) {
// 		for (let i = 0; i < proceduresName.length; i++) {
// 			const line: string = proceduresName[i];
// 			if (line) {
// 				procsHash.set(line.toLowerCase(), line);
// 			}
// 		}
// 	}

// 	return new Promise<string>((resolver, reject): void => {
// 		registry
// 			.loadGrammar('source.harbour')
// 			.then((grammar: vsTextmate.IGrammar | null): void => {
// 				try {
// 					if (grammar !== null) {
// 						const globalState: IMetaContext = {
// 							children: [],
// 							definitions: [],
// 							states: [],
// 							isInvert: false,
// 							startName: '',
// 						};

// 						const lines = code.replace('\r', '').split('\n');
// 						const specLineTypes: Line.Line[] = [];
// 						let hasSpecLineTypes = false;

// 						let currentState = globalState;
// 						let ruleStack = vsTextmate.INITIAL;
// 						const metaEvolution: number[] = [];
// 						for (let i = 0; i < lines.length; i++) {
// 							const correctSpaces: ISpaceCorrectorInfo[] = [];
// 							let states = currentState.states;

// 							const lastStateIndex = states.length;
// 							const lastState =
// 								lastStateIndex > 0 ? states[lastStateIndex - 1] : -1;

// 							let line = lines[i].trimEnd();
// 							if (line === '') {
// 								continue;
// 							}
// 							const lineTokens = grammar.tokenizeLine(line, ruleStack);
// 							const backIndent = false;
// 							let spaceCount: number;
// 							if (backIndent) {
// 								spaceCount = states.length - 1;
// 							} else {
// 								spaceCount = states.length;
// 							}
// 							let isC = false;
// 							for (let j = 0; j < lineTokens.tokens.length; j++) {
// 								const token = lineTokens.tokens[j];
// 								const scopes = token.scopes;

// 								let handled = false;
// 								scopes.shift();

// 								const toLowerCaseRange = (start: number, end: number) => {
// 									const lower = line.substring(start, end).toLocaleLowerCase();
// 									line = line.substring(0, start) + lower + line.substring(end);
// 								};

// 								if (scopes.includes('source.c.embedded.harbour')) {
// 									isC = true;
// 									if (line.startsWith('#include')) {
// 										specLineTypes.push({
// 											index: i,
// 											type: LineTypes.line_include_type,
// 										});
// 										hasSpecLineTypes = true;
// 									} else if (line.startsWith('#require')) {
// 										specLineTypes.push({
// 											index: i,
// 											type: LineTypes.line_required_type,
// 										});
// 										hasSpecLineTypes = true;
// 									}
// 									break;
// 								}
// 								if (j === 0) {
// 									if (scopes.includes('keyword.setcolor.harbour')) {
// 										handled = true;
// 										break;
// 									}
// 									if (
// 										scopes.includes('comment.block.harbour') &&
// 										line.indexOf('/*') < 0 &&
// 										line.indexOf('*/') < 0
// 									) {
// 										spaceCount++;
// 										handled = true;
// 										break;
// 									}
// 									if (line.startsWith('#include')) {
// 										specLineTypes.push({
// 											index: i,
// 											type: LineTypes.line_include_type,
// 										});
// 										hasSpecLineTypes = true;
// 										handled = true;
// 										break;
// 									} else if (line.startsWith('#require')) {
// 										specLineTypes.push({
// 											index: i,
// 											type: LineTypes.line_required_type,
// 										});
// 										hasSpecLineTypes = true;
// 										handled = true;
// 										break;
// 									} else if (
// 										scopes.includes(
// 											'keyword.control.directive.conditional.harbour'
// 										)
// 									) {
// 										const ifDefCondition =
// 											/^(?<ifdef>#ifdef\s+(?<name>\w+))|(?<ifndef>#ifndef\s+(?<name1>\w+))/i.exec(
// 												line
// 											);
// 										if (ifDefCondition && ifDefCondition.groups) {
// 											specLineTypes.push({
// 												index: i,
// 												type: LineTypes.line_ifDef_type,
// 											});
// 											const name = ifDefCondition.groups['name'];
// 											const name1 = ifDefCondition.groups['name1'];
// 											const currentName = name ?? name1;
// 											const invert = !!name1;
// 											const newStateTrue: IMetaContext = {
// 												children: [],
// 												parent: currentState,
// 												states: [...currentState.states],
// 												definitions: [...currentState.definitions],
// 												isInvert: false,
// 												startName: currentName,
// 											};
// 											currentState.children.push(newStateTrue);

// 											const newStateFalse: IMetaContext = {
// 												children: [],
// 												parent: currentState,
// 												states: [...currentState.states],
// 												definitions: [...currentState.definitions],
// 												isInvert: true,
// 												startName: currentName,
// 											};
// 											currentState.children.push(newStateFalse);

// 											currentState = invert ? newStateFalse : newStateTrue;

// 											if (newStateTrue.definitions.indexOf(currentName) < 0) {
// 												newStateTrue.definitions.push(currentName);
// 											}
// 										} else {
// 											const defineDefCondition =
// 												/^#define\s+(?<name>\w+)/i.exec(line);
// 											if (defineDefCondition && defineDefCondition.groups) {
// 												const name = defineDefCondition.groups['name'];
// 												currentState.definitions.push(name);
// 											} else if (line.toLowerCase().startsWith('#else')) {
// 												specLineTypes.push({
// 													index: i,
// 													type: LineTypes.line_ifDef_type,
// 												});
// 												const index =
// 													currentState.parent!.children.indexOf(currentState);
// 												if (currentState.isInvert) {
// 													currentState =
// 														currentState.parent!.children[index - 1];
// 												} else {
// 													currentState =
// 														currentState.parent!.children[index + 1];
// 												}
// 											} else if (line.toLowerCase().startsWith('#endif')) {
// 												if (currentState?.parent) {
// 													specLineTypes.push({
// 														index: i,
// 														type: LineTypes.line_ifDef_type,
// 													});
// 													currentState.parent.definitions =
// 														currentState.definitions;
// 													currentState = currentState?.parent;
// 												}
// 											}
// 										}
// 										spaceCount = 0;
// 										handled = true;
// 										break;
// 									} else if (
// 										scopes.includes('meta.preprocessor.pragma.harbour')
// 									) {
// 										specLineTypes.push({
// 											index: i,
// 											type: LineTypes.line_ifDef_type,
// 										});
// 										spaceCount = 0;
// 										handled = true;
// 										break;
// 									} else if (
// 										['keyword.else.harbour', 'keyword.elseif.harbour'].some(
// 											(p) => scopes.includes(p)
// 										)
// 									) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										//spaceCount = states.length - 1;
// 										spaceCount = Math.max(0, states.length - 1);
// 									} else if (
// 										scopes.includes('meta.array.harbour') &&
// 										!scopes.includes('punctuation.section.array.end.harbour')
// 									) {
// 										spaceCount = states.length + 1;
// 									} else if (
// 										lastState === TypeBlockCode.IS_FUNCTION &&
// 										[
// 											'meta.definition.letiable.local.harbour',
// 											'meta.definition.letiable.memlet.harbour',
// 											'meta.definition.letiable.public.harbour',
// 											'meta.parameters.harbour',
// 											'meta.definition.letiable.static.harbour',
// 											'meta.definition.letiable.private.harbour',
// 										].some((p) => scopes.includes(p))
// 									) {
// 										spaceCount = Math.max(0, states.length - 1);
// 										//handled = true;
// 										break;
// 									} else if (
// 										lastState === TypeBlockCode.IS_CLASS &&
// 										scopes.includes('storage.modifier.harbour')
// 									) {
// 										spaceCount = Math.max(0, states.length - 1);
// 										handled = true;
// 										break;
// 									} else if (scopes.includes('keyword.recover.harbour')) {
// 										spaceCount = Math.max(0, states.length - 1);
// 										handled = true;
// 										break;
// 									} else if (scopes.includes('keyword.if.harbour')) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.push(TypeBlockCode.IS_IF);
// 										spaceCount = Math.max(0, states.length - 1);
// 										//handled = true;
// 									} else if (
// 										[
// 											'meta.definition.variable.local.harbour',
// 											'meta.definition.variable.memvar.harbour',
// 											'meta.definition.variable.public.harbour',
// 											'meta.parameters.harbour',
// 											'meta.definition.variable.static.harbour',
// 											'meta.definition.variable.private.harbour',
// 										].some((p) => scopes.includes(p))
// 									) {
// 										spaceCount = Math.max(0, states.length - 1);
// 									} else if (
// 										['keyword.while.harbour', 'keyword.for.harbour'].some((p) =>
// 											scopes.includes(p)
// 										)
// 									) {
// 										if (replaceCycle) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 											for (let p = 1; p < lineTokens.tokens.length; p++) {
// 												const cToken = lineTokens.tokens[p];
// 												const cScopes = cToken.scopes;
// 												if (cScopes.includes('keyword.to.harbour')) {
// 													toLowerCaseRange(cToken.startIndex, cToken.endIndex);
// 												}
// 											}
// 										}
// 										states.push(TypeBlockCode.IS_CYCLE);
// 										break;
// 									}
// 								}

// 								if (!handled) {
// 									if (scopes.includes('meta.macro-exp.harbour')) {
// 										if (
// 											scopes.includes(
// 												'punctuation.definition.macro-exp.harbour'
// 											)
// 										) {
// 											const itemLine = line.substring(
// 												token.startIndex,
// 												token.endIndex
// 											);
// 											if (itemLine === '&') {
// 												metaEvolution.push(0);
// 											}
// 										} else if (
// 											scopes.includes(
// 												'punctuation.definition.begin.bracket.round.harbour'
// 											)
// 										) {
// 											if (metaEvolution.length > 0) {
// 												metaEvolution[metaEvolution.length - 1]++;
// 											}
// 										} else if (
// 											scopes.includes(
// 												'punctuation.definition.end.bracket.round.harbour'
// 											)
// 										) {
// 											if (metaEvolution.length > 0) {
// 												const index = metaEvolution.length - 1;
// 												metaEvolution[index]--;
// 												if (metaEvolution[index] <= 0) {
// 													metaEvolution.pop();
// 												}
// 											}
// 										}
// 									}
// 									if (scopes.includes('meta.function-call.harbour')) {
// 										if (scopes.includes('entity.name.function.harbour')) {
// 											const itemLine = line.substring(
// 												token.startIndex,
// 												token.endIndex
// 											);
// 											const procName = procsHash.get(itemLine.toLowerCase());
// 											if (!!procName && itemLine !== procName) {
// 												line = replaceAt(line, token.startIndex, procName);
// 											}
// 										} else if (scopes.includes('keyword.if.harbour')) {
// 											const itemLine = line.substring(
// 												token.startIndex,
// 												token.endIndex
// 											);
// 											if (itemLine !== 'If') {
// 												line = replaceAt(line, token.startIndex, 'If');
// 											}
// 											spaceCount = Math.max(0, states.length - 1);
// 										}
// 									}

// 									if (scopes.includes('keyword.begin.harbour')) {
// 										spaceCount = states.length;
// 										states.push(TypeBlockCode.IS_SEQUENCE);
// 									} else if (scopes.includes('keyword.endsequence.harbour')) {
// 										states.pop();
// 										spaceCount = states.length;
// 									} else if (scopes.includes('keyword.class.class.harbour')) {
// 										states = currentState.states = [TypeBlockCode.IS_CLASS];
// 										spaceCount = 0;
// 									} else if (scopes.includes('keyword.end.class.harbour')) {
// 										states.pop();
// 										spaceCount = states.length;
// 									} else if (
// 										scopes.includes('keyword.type.method.harbour') &&
// 										scopes[0] === 'meta.method.declaration.harbour'
// 									) {
// 										if (replaceMethods) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										spaceCount = 0;
// 										states = currentState.states = [TypeBlockCode.IS_FUNCTION];
// 									} else if (scopes.includes('keyword.type.function.harbour')) {
// 										if (replaceMethods) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										spaceCount = 0;

// 										states = currentState.states = [TypeBlockCode.IS_FUNCTION];
// 									} else if (
// 										lastState === TypeBlockCode.IS_FUNCTION &&
// 										scopes.includes('keyword.return.harbour')
// 									) {
// 										if (replaceMethods) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.pop();
// 										spaceCount = states.length;
// 									} else if (
// 										scopes.includes('keyword.switch.harbour') ||
// 										(scopes.includes('keyword.case.harbour') &&
// 											line.toLowerCase().indexOf('do ') >= 0)
// 									) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(0, token.endIndex);
// 										}
// 										states.push(TypeBlockCode.IS_SWITCH);
// 										spaceCount = states.length - 1;
// 									} else if (
// 										[
// 											'keyword.endcase.harbour',
// 											'keyword.endswitch.harbour',
// 										].some((p) => scopes.includes(p))
// 									) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.pop();

// 										spaceCount = states.length;
// 									} else if (
// 										scopes.includes('keyword.case.harbour') ||
// 										scopes.includes('keyword.otherwise.harbour')
// 									) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										if (!(lastState === TypeBlockCode.IS_CASE)) {
// 											states.push(TypeBlockCode.IS_CASE);
// 										}
// 										spaceCount = states.length - 1;
// 									} else if (
// 										scopes.includes('keyword.while.harbour') &&
// 										line.toLowerCase().startsWith('do ')
// 									) {
// 										if (replaceCycle) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.push(TypeBlockCode.IS_CYCLE);
// 										break;
// 									} else if (
// 										['keyword.enddo.harbour', 'keyword.next.harbour'].some(
// 											(p) => scopes.includes(p)
// 										)
// 									) {
// 										if (replaceCycle) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.pop();
// 										spaceCount = states.length;
// 									} else if (scopes.includes('keyword.endif.harbour')) {
// 										if (replaceLogical) {
// 											toLowerCaseRange(token.startIndex, token.endIndex);
// 										}
// 										states.pop();
// 										spaceCount = states.length;
// 									} else if (
// 										[
// 											'keyword.operator.logical.harbour',
// 											'keyword.operator.comparison.harbour',
// 											'keyword.operator.arithmetic.harbour',
// 											'keyword.operator.assignment.harbour',
// 											'keyword.operator.assignment.augmented.harbour',
// 										].some((p) => scopes.includes(p))
// 									) {
// 										if (metaEvolution.length > 0) {
// 											getCountSpacesAdded(token, line, correctSpaces, 0);
// 										} else {
// 											getCountSpacesAdded(token, line, correctSpaces, 1);
// 										}
// 									} else if (
// 										scopes.includes('punctuation.separator.comma.harbour')
// 									) {
// 										let countSpaces = 0;
// 										let c = 0;
// 										for (c = token.endIndex; c < line.length; c++) {
// 											if (line[c] === ' ') {
// 												countSpaces++;
// 											} else {
// 												break;
// 											}
// 										}
// 										if (metaEvolution.length === 0) {
// 											if (countSpaces > 1) {
// 												correctSpaces.push({
// 													index: c - 1,
// 													changeCount: countSpaces - 1,
// 													newString: '',
// 												});
// 											} else if (countSpaces === 0) {
// 												correctSpaces.push({
// 													index: token.endIndex,
// 													changeCount: 0,
// 													newString: ' ',
// 												});
// 											}
// 										}
// 									} else if (scopes.length === 0) {
// 										const selectedLine = line.substring(
// 											token.startIndex,
// 											token.endIndex
// 										);
// 										const selectedLines = selectedLine.split(' ');
// 										let selectedLinesIndex = token.startIndex;
// 										for (let p = 0; p < selectedLines.length; p++) {
// 											const key = selectedLines[p].toLowerCase();
// 											const fullName = FullNames.get(key);
// 											if (fullName) {
// 												correctSpaces.push({
// 													index: selectedLinesIndex,
// 													changeCount: key.length,
// 													newString: fullName,
// 												});
// 											}
// 											selectedLinesIndex += key.length + 1;
// 										}
// 									}
// 								}
// 							}
// 							if (correctSpaces.length > 0) {
// 								for (
// 									let cIndex = correctSpaces.length - 1;
// 									cIndex >= 0;
// 									cIndex--
// 								) {
// 									const item = correctSpaces[cIndex];
// 									const s1 = line.substring(0, item.index);
// 									const s2 = line.substring(item.index + item.changeCount);
// 									if (item.newString.length > 0) {
// 										line = s1 + item.newString + s2;
// 									} else {
// 										line = s1 + s2;
// 									}
// 								}
// 							}
// 							if (isC) {
// 								continue;
// 							}
// 							if (line.startsWith(' ') && line) {
// 								continue;
// 							}
// 						}
// 						if (hasSpecLineTypes) {
// 							sortLines(lines, specLineTypes);
// 						}
// 						const codeW = provideDocumentFormattingEdits(document)
// 						resolver(parseAndRestoreMemvars(codeW));
// 					}
// 				} catch (ex) {
// 					reject(ex);
// 				}
// 			});
// 	});
// }

// function provideDocumentFormattingEdits(
// 	document: vscode.TextDocument
// ): string {
// 	const edits: vscode.TextEdit[] = [];
// 	const tabSize =
// 		vscode.workspace.getConfiguration('editor').get<number>('tabSize') || 4;
// 	const tab = ' '.repeat(tabSize);

// 	let currentIndentLevel = 0;

// 	for (let i = 0; i < document.lineCount; i++) {
// 		const line = document.lineAt(i);
// 		const trimmedLine = line.text.trim();

// 		// Уменьшаем уровень отступа для строк с закрывающими ключевыми словами
// 		if (isClosingKeyword(trimmedLine)) {
// 			currentIndentLevel = Math.max(0, currentIndentLevel - 1);
// 		}

// 		// Форматируем строку с учетом текущего уровня отступа
// 		const formattedLine = formatLine(trimmedLine, tab, currentIndentLevel);

// 		if (formattedLine !== line.text) {
// 			edits.push(vscode.TextEdit.replace(line.range, formattedLine));
// 		}

// 		// Увеличиваем уровень отступа для строк с открывающими ключевыми словами
// 		if (isOpeningKeyword(trimmedLine)) {
// 			currentIndentLevel++;
// 		}
// 	}
// 	let x2: string = '';
// 	edits.forEach((x) => {
// 		x2 += x.newText+'\n';
// 	});

// 	return x2;
// }

// function formatLine(line: string, tab: string, indentLevel: number): string {
// 	// Приводим ключевые слова в нижний регистр
// 	const formatted = formatKeywords(line);

// 	// Добавляем корректный отступ
// 	const indented = tab.repeat(indentLevel) + formatted;

// 	// Удаляем лишние пробелы в конце строки
// 	return indented.trimEnd();
// }

// function formatKeywords(line: string): string {
// 	const keywords = [
// 		'if',
// 		'else',
// 		'endif',
// 		'for',
// 		'do while',
// 		'return',
// 		'function',
// 		'procedure',
// 		'static',
// 		'local',
// 		'as',
// 		'array',
// 		'enddo',
// 	];

// 	for (const keyword of keywords) {
// 		const regex = new RegExp(`\\b${keyword}\\b`, 'gi'); // Ищем слово независимо от регистра
// 		line = line.replace(regex, keyword.toLowerCase());
// 	}

// 	return line;
// }

// function isOpeningKeyword(line: string): boolean {
// 	// Ключевые слова, которые увеличивают уровень отступа
// 	const openingKeywords = ['if', 'for', 'do while', 'function', 'procedure'];
// 	return openingKeywords.some((keyword) =>
// 		line.toLowerCase().startsWith(keyword)
// 	);
// }

// function isClosingKeyword(line: string): boolean {
// 	// Ключевые слова, которые уменьшают уровень отступа
// 	const closingKeywords = ['endif', 'return', 'enddo'];
// 	return closingKeywords.some((keyword) =>
// 		line.toLowerCase().startsWith(keyword)
// 	);
// }

// function getCountSpacesAdded(
// 	token: vsTextmate.IToken,
// 	line: string,
// 	correctSpaces: ISpaceCorrectorInfo[],
// 	maxSpaces: number
// ) {
// 	let countSpaces = 0;
// 	let c = 0;
// 	for (c = token.startIndex - 1; c >= 0; c--) {
// 		if (line[c] === ' ') {
// 			countSpaces++;
// 		} else {
// 			break;
// 		}
// 	}
// 	if (
// 		correctSpaces.length === 0 ||
// 		correctSpaces[correctSpaces.length - 1].index !== token.startIndex
// 	) {
// 		if (countSpaces > maxSpaces) {
// 			correctSpaces.push({
// 				index: token.startIndex - (countSpaces - maxSpaces),
// 				changeCount: countSpaces - maxSpaces,
// 				newString: '',
// 			});
// 		} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
// 			correctSpaces.push({
// 				index: token.startIndex,
// 				changeCount: 0,
// 				newString: ' '.repeat(maxSpaces - countSpaces),
// 			});
// 		}
// 	}
// 	countSpaces = 0;
// 	for (c = token.endIndex; c < line.length; c++) {
// 		if (line[c] === ' ') {
// 			countSpaces++;
// 		} else {
// 			break;
// 		}
// 	}
// 	if (countSpaces > maxSpaces) {
// 		correctSpaces.push({
// 			index: c - 1,
// 			changeCount: countSpaces - maxSpaces,
// 			newString: '',
// 		});
// 	} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
// 		correctSpaces.push({
// 			index: token.endIndex,
// 			changeCount: 0,
// 			newString: ' '.repeat(maxSpaces - countSpaces),
// 		});
// 	}
// 	return { countSpaces, c };
// }

// function sortLines(lines: string[], specLineTypes: Line.Line[]) {
// 	const blocks: Line.Line[][] = [];
// 	let currentItem: Line.Line[] = [];

// 	for (let i = 0; i < specLineTypes.length; i++) {
// 		const item = specLineTypes[i];
// 		if (item.type === LineTypes.line_ifDef_type) {
// 			if (currentItem.length > 0) {
// 				blocks.push(currentItem);
// 				currentItem = [];
// 			}
// 		} else {
// 			currentItem.push(item);
// 		}
// 	}
// 	if (currentItem.length > 0) {
// 		blocks.push(currentItem);
// 	}

// 	//Перемещение спецстрок в одну кучу
// 	for (let i = blocks.length - 1; i >= 0; i--) {
// 		currentItem = blocks[i];

// 		if (currentItem.length > 1) {
// 			let lastIndex = -1;
// 			const startIndex = currentItem[0].index;
// 			const otherLines: string[] = [];
// 			for (let j = currentItem.length - 1; j >= 1; j--) {
// 				const rowIndex = currentItem[j].index;
// 				otherLines.push(lines[rowIndex]);
// 				lines[rowIndex] = '';
// 				if (lastIndex >= 0) {
// 					for (let k = lastIndex; k > rowIndex; k--) {
// 						lines[k] = lines[k - 1];
// 					}
// 				}
// 				lastIndex = rowIndex;
// 			}
// 			otherLines.push(lines[startIndex]);
// 			otherLines.sort(compareLines);

// 			if (lastIndex >= 0) {
// 				for (let k = lastIndex; k > startIndex; k--) {
// 					lines[k] = lines[k - 1];
// 				}
// 			}
// 			for (let j = 0; j < currentItem.length; j++) {
// 				const rowIndex = startIndex + j;
// 				lines[rowIndex] = otherLines[j];
// 			}

// 			let lastType = -1;
// 			let countEmptyLines = 0;

// 			let boundIndex = startIndex + currentItem.length;
// 			for (let j = boundIndex; j < lines.length; j++) {
// 				if (lines[j] === '' || lines[j] === '\r') {
// 					countEmptyLines++;
// 				} else {
// 					break;
// 				}
// 			}
// 			if (countEmptyLines > 1) {
// 				lines.splice(boundIndex + 1, countEmptyLines - 1);
// 			}

// 			for (let j = currentItem.length - 1; j >= 0; j--) {
// 				const line = lines[startIndex + j];
// 				const regex =
// 					/#(include\s+[<](?<inc1>[^>]+)[>])|(include\s+["](?<inc2>[^"]+)["])|(require\s+["](?<rec1>[^"]+)["])/gm;
// 				const r = regex.exec(line);
// 				let type = -1;
// 				if (r?.groups) {
// 					const inc1 = r.groups['inc1'];
// 					const inc2 = r.groups['inc2'];
// 					const rec1 = r.groups['rec1'];

// 					if (inc1) {
// 						type = 1;
// 						lines[startIndex + j] = '#include <' + inc1.toLowerCase() + '>';
// 					} else if (inc2) {
// 						type = 2;
// 					} else if (rec1) {
// 						type = 3;
// 					}
// 				}

// 				if (lastType > 0 && type > 0 && lastType !== type) {
// 					lines.splice(startIndex + j + 1, 0, '');
// 					boundIndex++;
// 				}
// 				lastType = type;
// 			}
// 		}
// 	}
// }

// function replaceAt(s: string, index: number, replacement: string) {
// 	return (
// 		s.substring(0, index) +
// 		replacement +
// 		s.substring(index + replacement.length)
// 	);
// }

// function compareLines(a: string, b: string): number {
// 	if (a.startsWith('#include') && b.startsWith('#include')) {
// 		if (a.indexOf(' "') > 0 && b.indexOf(' <') > 0) {
// 			return 1;
// 		} else if (a.indexOf(' <') > 0 && b.indexOf(' "') > 0) {
// 			return -1;
// 		}
// 	}
// 	return a.localeCompare(b);
// }
