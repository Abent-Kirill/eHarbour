import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as vsTextmate from 'vscode-textmate';
import { ScopeName } from 'vscode-textmate/release/theme';
import { IFormatterConfiguration } from '../types/IFormatterConfiguration';
import { IMetaContext } from '../types/IMetaContext';
import { ISpaceCorrectorInfo } from '../types/ISpaceCorrectorInfo';
import * as Line from '../types/Line';
import { LineTypes } from '../types/LineTypes';
import { TypeBlockCode } from '../types/TypeBlockCode';

const FullNames = new Map<string, string>([
	['sele', 'select'],
	['select', 'select'],
	['devi', 'device'],
	['device', 'device'],
	['scre', 'screen'],
	['screen', 'screen'],
	['comm', 'commit'],
	['commit', 'commit'],
]);

export function registerFormatCommand(
	context: vscode.ExtensionContext,
	formatterConfiguration: IFormatterConfiguration,
	vscodeOnigurumaLibPromise: Promise<vsTextmate.IOnigLib>,
): void {
	const eHarbourFormatCommand = vscode.commands.registerCommand(
		'eHarbour.format',
		async () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor) {
				vscode.window.showErrorMessage('Нет открытого текстового редактора.');
				return;
			}

			const document = editor.document;
			if (!isSupportedFile(document.fileName)) {
				vscode.window.showWarningMessage(
					'Поддерживаются только файлы с расширением .prg.',
				);
				return;
			}
			const selection = editor.selection;

			// Если выделение пустое, используем текущую строку как start и end
			const selectedCode: vscode.Selection = selection.isEmpty
				? new vscode.Selection(
						new vscode.Position(selection.start.line, 0),
						new vscode.Position(selection.end.line, 0),
				  )
				: selection; // Если выделение есть, просто используем его

			const text = document.getText(selectedCode);

			try {
				vscode.window.showInformationMessage(
					'Начат процесс форматирования кода...',
				);

				const formattedText = await getFormattedDoc(
					text,
					formatterConfiguration,
					vscodeOnigurumaLibPromise,
				);
				const edit = new vscode.WorkspaceEdit();

				// Перенести в функцию формата
				if (text !== formattedText) {
					await editor.edit((editBuilder) => {
						editBuilder.replace(editor.selection, formattedText);
					});
					await vscode.workspace.applyEdit(edit);
					vscode.window.showInformationMessage('Код успешно отформатирован.');
				} else {
					vscode.window.showInformationMessage(
						'Форматирование не внесло изменений в код.',
					);
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Ошибка форматирования: ${(error as Error).message}`,
				);
			}
		},
	);

	context.subscriptions.push(eHarbourFormatCommand);
}

function isSupportedFile(fileName: string): boolean {
	return path.extname(fileName).toLowerCase() === '.prg';
}

function parseMemVarsFrom(lines: string[]): string[][] {
	const result: string[][] = [];

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine.startsWith('memvar')) {
			const vars = trimmedLine
				.replace('memvar', '')
				.split(',')
				.map((v) => v.trim());
			if (vars.length > 0) {
				result.push(vars);
			}
			continue;
		}
	}
	return result;
}

function removeDuplicates(memvarBlocks: string[][]): string[][] {
	const uniqueValues = new Set<string>();

	return memvarBlocks.map((block) =>
		block.filter((varName) =>
			uniqueValues.has(varName) ? false : uniqueValues.add(varName),
		),
	);
}

function restoreBlocks(
	deduplicatedBlocks: string[][],
	lines: string[],
): string[] {
	const processedLines: string[] = [];
	let blockIndex = 0;

	for (const line of lines) {
		const trimmedLine = line.trim();

		if (trimmedLine.startsWith('memvar')) {
			processedLines.push(
				blockIndex < deduplicatedBlocks.length
					? `memvar ${deduplicatedBlocks[blockIndex++].join(', ')}`
					: line,
			);
		} else {
			processedLines.push(trimmedLine);
		}
	}

	return processedLines;
}

function parseAndRestoreMemvars(input: string): string {
	return restoreBlocks(
		removeDuplicates(parseMemVarsFrom(input.split('\n'))),
		input.split('\n'),
	).join('\n');
}

function getFormattedDoc(
	code: string,
	harbour: IFormatterConfiguration,
	vscodeOnigurumaLibPromise: Promise<vsTextmate.IOnigLib>,
): Promise<string> {
	const registry = new vsTextmate.Registry({
		onigLib: vscodeOnigurumaLibPromise,
		loadGrammar: async (
			scopeName: ScopeName,
		): Promise<vsTextmate.IRawGrammar | undefined | null> => {
			if (scopeName === 'source.harbour') {
				try {
					const fileName = path.join(
						__dirname,
						'./syntaxes/harbour.tmLanguage.json',
					);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const data: any = await fs.promises.readFile(fileName);
					return vsTextmate.parseRawGrammar(data.toString(), fileName);
				} catch (ex) {
					console.error(ex);
				}
			}
			console.log('Unknown scope name: ${scopeName}');
			return null;
		},
	});

	const configuration = vscode.workspace.getConfiguration('eharbour');
	const proceduresName = configuration.get<string[]>('proceduresname', []);
	const replaceLogical = harbour.replace.logical;
	const replaceCycle = harbour.replace.cycle;
	const replaceMethods = harbour.replace.methods;
	const procsFileName = path.join(__dirname, './syntaxes/HarbourProcsExt.txt');
	const procsData: string = fs.readFileSync(procsFileName, 'utf8');
	const procs = procsData.replaceAll('\r', '').split('\n');
	const procsHash = new Map<string, string>();

	for (let i = 0; i < procs.length; i++) {
		const line: string = procs[i];
		if (line) {
			procsHash.set(line.toLowerCase(), line);
		}
	}

	if (proceduresName) {
		for (let i = 0; i < proceduresName.length; i++) {
			const line: string = proceduresName[i];
			if (line) {
				procsHash.set(line.toLowerCase(), line);
			}
		}
	}

	const result = new Promise<string>((resolver, reject) => {
		registry
			.loadGrammar('source.harbour')
			.then((grammar: vsTextmate.IGrammar | null) => {
				try {
					if (grammar !== null) {
						const globalState: IMetaContext = {
							children: [],
							definitions: [],
							states: [],
							isInvert: false,
							startName: '',
						};

						const lines = code.replace('\r', '').split('\n');
						const specLineTypes: Line.Line[] = [];
						let hasSpecLineTypes = false;
						let startRow, endRow: number;

						let currentState = globalState;
						let ruleStack = vsTextmate.INITIAL;
						const metaEvolution: number[] = [];
						for (let i = 0; i < lines.length; i++) {
							const correctSpaces: ISpaceCorrectorInfo[] = [];
							let states = currentState.states;

							const lastStateIndex = states.length;
							const lastState =
								lastStateIndex > 0 ? states[lastStateIndex - 1] : -1;

							let line = lines[i].trim();
							if (line === '') {
								continue;
							}
							const lineTokens = grammar.tokenizeLine(line, ruleStack);
							const backIndent = false;
							let spaceCount: number;
							if (backIndent) {
								spaceCount = states.length - 1;
							} else {
								spaceCount = states.length;
							}
							let isC = false;
							for (let j = 0; j < lineTokens.tokens.length; j++) {
								const token = lineTokens.tokens[j];
								const scopes = token.scopes;
								console.log(`
									${i + 1},${j} - token from ${token.startIndex} to ${token.endIndex}  +
										(${line.substring(token.startIndex, token.endIndex)})  +
										with scopes ${scopes.join(', ')},`);

								let handled = false;

								scopes.shift();

								const checkF = function (...strings: string[]): boolean {
									for (let i = 0; i < scopes.length; i++) {
										for (let j = 0; j < strings.length; j++) {
											if (scopes[i] === strings[j]) {
												return true;
											}
										}
									}
									return false;
								};

								const checkFP = function (
									scopes: string[],
									...strings: string[]
								): boolean {
									for (let i = 0; i < scopes.length; i++) {
										for (let j = 0; j < strings.length; j++) {
											if (scopes[i] === strings[j]) {
												return true;
											}
										}
									}
									return false;
								};
								const formatF = function (start: number, end: number) {
									const lower = line.substring(start, end).toLocaleLowerCase();
									line = line.substring(0, start) + lower + line.substring(end);
								};

								if (checkF('source.c.embedded.harbour')) {
									isC = true;
									if (line.startsWith('#include')) {
										specLineTypes.push({
											index: i,
											type: LineTypes.line_include_type,
										});
										hasSpecLineTypes = true;
									} else if (line.startsWith('#require')) {
										specLineTypes.push({
											index: i,
											type: LineTypes.line_required_type,
										});
										hasSpecLineTypes = true;
									}
									break;
								}
								if (j === 0) {
									if (checkF('keyword.setcolor.harbour')) {
										handled = true;
										break;
									}
									if (
										checkF('comment.block.harbour') &&
										line.indexOf('/*') < 0 &&
										line.indexOf('*/') < 0
									) {
										spaceCount++;
										handled = true;
										break;
									}
									if (line.startsWith('#include')) {
										specLineTypes.push({
											index: i,
											type: LineTypes.line_include_type,
										});
										hasSpecLineTypes = true;
										handled = true;
										break;
									} else if (line.startsWith('#require')) {
										specLineTypes.push({
											index: i,
											type: LineTypes.line_required_type,
										});
										hasSpecLineTypes = true;
										handled = true;
										break;
									} else if (
										checkF('keyword.control.directive.conditional.harbour')
									) {
										const ifDefCondition =
											/^(?<ifdef>#ifdef\s+(?<name>\w+))|(?<ifndef>#ifndef\s+(?<name1>\w+))/i.exec(
												line,
											);
										if (ifDefCondition && ifDefCondition.groups) {
											specLineTypes.push({
												index: i,
												type: LineTypes.line_ifDef_type,
											});
											const name = ifDefCondition.groups['name'];
											const name1 = ifDefCondition.groups['name1'];
											const currentName = name ?? name1;

											const invert = !!name1;
											const newStateTrue: IMetaContext = {
												children: [],
												parent: currentState,
												states: [...currentState.states],
												definitions: [...currentState.definitions],
												isInvert: false,
												startName: currentName,
											};
											currentState.children.push(newStateTrue);

											const newStateFalse: IMetaContext = {
												children: [],
												parent: currentState,
												states: [...currentState.states],
												definitions: [...currentState.definitions],
												isInvert: true,
												startName: currentName,
											};
											currentState.children.push(newStateFalse);

											currentState = invert ? newStateFalse : newStateTrue;

											if (newStateTrue.definitions.indexOf(currentName) < 0) {
												newStateTrue.definitions.push(currentName);
											}
										} else {
											const defineDefCondition =
												/^#define\s+(?<name>\w+)/i.exec(line);
											if (defineDefCondition && defineDefCondition.groups) {
												const name = defineDefCondition.groups['name'];
												currentState.definitions.push(name);
											} else if (line.toLowerCase().startsWith('#else')) {
												specLineTypes.push({
													index: i,
													type: LineTypes.line_ifDef_type,
												});
												const index =
													currentState.parent!.children.indexOf(currentState);
												if (currentState.isInvert) {
													currentState =
														currentState.parent!.children[index - 1];
												} else {
													currentState =
														currentState.parent!.children[index + 1];
												}
											} else if (line.toLowerCase().startsWith('#endif')) {
												if (currentState?.parent) {
													specLineTypes.push({
														index: i,
														type: LineTypes.line_ifDef_type,
													});
													currentState.parent.definitions =
														currentState.definitions;
													currentState = currentState?.parent;
												}
											}
										}
										spaceCount = 0;
										handled = true;
										break;
									} else if (checkF('meta.preprocessor.pragma.harbour')) {
										specLineTypes.push({
											index: i,
											type: LineTypes.line_ifDef_type,
										});
										spaceCount = 0;
										handled = true;
										break;
									} else if (
										checkF('keyword.else.harbour', 'keyword.elseif.harbour')
									) {
										if (replaceLogical) {
											formatF(token.startIndex, token.endIndex);
										}
										spaceCount = states.length - 1;
									} else if (
										checkF('meta.array.harbour') &&
										!checkF('punctuation.section.array.end.harbour')
									) {
										spaceCount = states.length + 1;
									} else if (
										lastState === TypeBlockCode.IS_FUNCTION &&
										checkF(
											'meta.definition.letiable.local.harbour',
											'meta.definition.letiable.memlet.harbour',
											'meta.definition.letiable.public.harbour',
											'meta.parameters.harbour',
											'meta.definition.letiable.static.harbour',
											'meta.definition.letiable.private.harbour',
										)
									) {
										spaceCount = Math.max(0, states.length - 1);
										handled = true;
										break;
									} else if (
										lastState === TypeBlockCode.IS_CLASS &&
										checkF('storage.modifier.harbour')
									) {
										spaceCount = Math.max(0, states.length - 1);
										handled = true;
										break;
									} else if (checkF('keyword.recover.harbour')) {
										spaceCount = Math.max(0, states.length - 1);
										handled = true;
										break;
									} else if (checkF('keyword.if.harbour')) {
										if (replaceLogical) {
											formatF(token.startIndex, token.endIndex);
										}
										states.push(TypeBlockCode.IS_IF);
										handled = true;
									} else if (
										checkF('keyword.while.harbour', 'keyword.for.harbour')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex);
											for (let p = 1; p < lineTokens.tokens.length; p++) {
												const cToken = lineTokens.tokens[p];

												const cScopes = cToken.scopes;
												if (checkFP(cScopes, 'keyword.to.harbour')) {
													formatF(cToken.startIndex, cToken.endIndex);
												}
											}
										}
										states.push(TypeBlockCode.IS_CYCLE);

										break;
									}
								}

								if (!handled) {
									if (checkF('meta.macro-exp.harbour')) {
										if (checkF('punctuation.definition.macro-exp.harbour')) {
											const itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											);
											if (itemLine === '&') {
												metaEvolution.push(0);
											}
										} else if (
											checkF(
												'punctuation.definition.begin.bracket.round.harbour',
											)
										) {
											if (metaEvolution.length > 0) {
												metaEvolution[metaEvolution.length - 1]++;
											}
										} else if (
											checkF('punctuation.definition.end.bracket.round.harbour')
										) {
											if (metaEvolution.length > 0) {
												const index = metaEvolution.length - 1;
												metaEvolution[index]--;
												if (metaEvolution[index] <= 0) {
													metaEvolution.pop();
												}
											}
										}
									}
									if (checkF('meta.function-call.harbour')) {
										if (checkF('entity.name.function.harbour')) {
											const itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											);
											const procName = procsHash.get(itemLine.toLowerCase());
											if (!!procName && itemLine !== procName) {
												line = replaceAt(line, token.startIndex, procName);
											}
										} else if (checkF('keyword.if.harbour')) {
											const itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											);
											if (itemLine !== 'If') {
												line = replaceAt(line, token.startIndex, 'If');
											}
										}
									}

									if (checkF('keyword.begin.harbour')) {
										spaceCount = states.length;
										states.push(TypeBlockCode.IS_SEQUENCE);
									} else if (checkF('keyword.endsequence.harbour')) {
										states.pop();
										spaceCount = states.length;
									} else if (checkF('keyword.class.class.harbour')) {
										states = currentState.states = [TypeBlockCode.IS_CLASS];
										spaceCount = 0;
									} else if (checkF('keyword.end.class.harbour')) {
										states.pop();
										spaceCount = states.length;
									} else if (
										checkF('keyword.type.method.harbour') &&
										scopes[0] === 'meta.method.declaration.harbour'
									) {
										if (replaceMethods) {
											formatF(token.startIndex, token.endIndex);
										}
										spaceCount = 0;
										states = currentState.states = [TypeBlockCode.IS_FUNCTION];
									} else if (checkF('keyword.type.function.harbour')) {
										if (replaceMethods) {
											formatF(token.startIndex, token.endIndex);
										}
										spaceCount = 0;

										states = currentState.states = [TypeBlockCode.IS_FUNCTION];
									} else if (
										lastState === TypeBlockCode.IS_FUNCTION &&
										checkF('keyword.return.harbour')
									) {
										if (replaceMethods) {
											formatF(token.startIndex, token.endIndex);
										}
										states.pop();
										spaceCount = states.length;
									} else if (
										checkF('keyword.switch.harbour') ||
										(checkF('keyword.case.harbour') &&
											line.toLowerCase().indexOf('do ') >= 0)
									) {
										if (replaceLogical) {
											formatF(0, token.endIndex);
										}
										states.push(TypeBlockCode.IS_SWITCH);
										spaceCount = states.length - 1;
									} else if (
										checkF(
											'keyword.endcase.harbour',
											'keyword.endswitch.harbour',
										)
									) {
										if (replaceLogical) {
											formatF(token.startIndex, token.endIndex);
										}
										states.pop();

										spaceCount = states.length;
									} else if (
										checkF('keyword.case.harbour') ||
										checkF('keyword.otherwise.harbour')
									) {
										if (replaceLogical) {
											formatF(token.startIndex, token.endIndex);
										}
										if (!(lastState === TypeBlockCode.IS_CASE)) {
											states.push(TypeBlockCode.IS_CASE);
										}
										spaceCount = states.length - 1;
									} else if (
										checkF('keyword.while.harbour') &&
										line.toLowerCase().startsWith('do ')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex);
										}
										states.push(TypeBlockCode.IS_CYCLE);
										break;
									} else if (
										checkF('keyword.enddo.harbour', 'keyword.next.harbour')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex);
										}
										states.pop();
										spaceCount = states.length;
									} else if (checkF('keyword.endif.harbour')) {
										if (replaceLogical) {
											formatF(token.startIndex, token.endIndex);
										}
										states.pop();
										spaceCount = states.length;
									} else if (
										checkF(
											'keyword.operator.logical.harbour',
											'keyword.operator.comparison.harbour',
											'keyword.operator.arithmetic.harbour',
											'keyword.operator.assignment.harbour',
											'keyword.operator.assignment.augmented.harbour',
										)
									) {
										if (metaEvolution.length > 0) {
											getCountSpacesAdded(token, line, correctSpaces, 0);
										} else {
											getCountSpacesAdded(token, line, correctSpaces, 1);
										}
									} else if (checkF('punctuation.separator.comma.harbour')) {
										let countSpaces = 0;
										let c = 0;
										for (c = token.endIndex; c < line.length; c++) {
											if (line[c] === ' ') {
												countSpaces++;
											} else {
												break;
											}
										}
										if (metaEvolution.length === 0) {
											if (countSpaces > 1) {
												correctSpaces.push({
													index: c - 1,
													changeCount: countSpaces - 1,
													newString: '',
												});
											} else if (countSpaces === 0) {
												correctSpaces.push({
													index: token.endIndex,
													changeCount: 0,
													newString: ' ',
												});
											}
										}
									} else if (scopes.length === 0) {
										const selectedLine = line.substring(
											token.startIndex,
											token.endIndex,
										);
										const selectedLines = selectedLine.split(' ');
										let selectedLinesIndex = token.startIndex;
										for (let p = 0; p < selectedLines.length; p++) {
											const key = selectedLines[p].toLowerCase();
											const fullName = FullNames.get(key);
											if (fullName) {
												correctSpaces.push({
													index: selectedLinesIndex,
													changeCount: key.length,
													newString: fullName,
												});
											}
											selectedLinesIndex += key.length + 1;
										}
									}
								}
							}
							if (correctSpaces.length > 0) {
								for (
									let cIndex = correctSpaces.length - 1;
									cIndex >= 0;
									cIndex--
								) {
									const item = correctSpaces[cIndex];
									const s1 = line.substring(0, item.index);
									const s2 = line.substring(item.index + item.changeCount);
									if (item.newString.length > 0) {
										line = s1 + item.newString + s2;
									} else {
										line = s1 + s2;
									}
								}
							}
							if (isC) {
								continue;
							}
							//Tab size 2
							lines[i] = ' '.repeat(spaceCount * 2) + line;
							ruleStack = lineTokens.ruleStack;
						}
						if (hasSpecLineTypes) {
							sortLines(lines, specLineTypes);
						}

						resolver(lines.join('\n'));
					}
				} catch (ex) {
					reject(ex);
				}
			});
	});
	const formattedCode = async (): Promise<string> => {
		const code = await result;
		const codeWithAddSpaces = code.replace(/,(\S)/g, ', $1');
		return parseAndRestoreMemvars(codeWithAddSpaces);
	};
	return formattedCode();
}

function getCountSpacesAdded(
	token: vsTextmate.IToken,
	line: string,
	correctSpaces: ISpaceCorrectorInfo[],
	maxSpaces: number,
) {
	let countSpaces = 0;
	let c = 0;
	for (c = token.startIndex - 1; c >= 0; c--) {
		if (line[c] === ' ') {
			countSpaces++;
		} else {
			break;
		}
	}
	if (
		correctSpaces.length === 0 ||
		correctSpaces[correctSpaces.length - 1].index !== token.startIndex
	) {
		if (countSpaces > maxSpaces) {
			correctSpaces.push({
				index: token.startIndex - (countSpaces - maxSpaces),
				changeCount: countSpaces - maxSpaces,
				newString: '',
			});
		} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
			correctSpaces.push({
				index: token.startIndex,
				changeCount: 0,
				newString: ' '.repeat(maxSpaces - countSpaces),
			});
		}
	}
	countSpaces = 0;
	for (c = token.endIndex; c < line.length; c++) {
		if (line[c] === ' ') {
			countSpaces++;
		} else {
			break;
		}
	}
	if (countSpaces > maxSpaces) {
		correctSpaces.push({
			index: c - 1,
			changeCount: countSpaces - maxSpaces,
			newString: '',
		});
	} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
		correctSpaces.push({
			index: token.endIndex,
			changeCount: 0,
			newString: ' '.repeat(maxSpaces - countSpaces),
		});
	}
	return { countSpaces, c };
}

function sortLines(lines: string[], specLineTypes: Line.Line[]) {
	const blocks: Line.Line[][] = [];
	let currentItem: Line.Line[] = [];

	for (let i = 0; i < specLineTypes.length; i++) {
		const item = specLineTypes[i];
		if (item.type === LineTypes.line_ifDef_type) {
			if (currentItem.length > 0) {
				blocks.push(currentItem);
				currentItem = [];
			}
		} else {
			currentItem.push(item);
		}
	}
	if (currentItem.length > 0) {
		blocks.push(currentItem);
	}

	//Перемещение спецстрок в одну кучу
	for (let i = blocks.length - 1; i >= 0; i--) {
		currentItem = blocks[i];

		if (currentItem.length > 1) {
			let lastIndex = -1;
			const startIndex = currentItem[0].index;
			const otherLines: string[] = [];
			for (let j = currentItem.length - 1; j >= 1; j--) {
				const rowIndex = currentItem[j].index;
				otherLines.push(lines[rowIndex]);
				lines[rowIndex] = '';
				if (lastIndex >= 0) {
					for (let k = lastIndex; k > rowIndex; k--) {
						lines[k] = lines[k - 1];
					}
				}
				lastIndex = rowIndex;
			}
			otherLines.push(lines[startIndex]);
			otherLines.sort(compareLines);

			if (lastIndex >= 0) {
				for (let k = lastIndex; k > startIndex; k--) {
					lines[k] = lines[k - 1];
				}
			}
			for (let j = 0; j < currentItem.length; j++) {
				const rowIndex = startIndex + j;
				lines[rowIndex] = otherLines[j];
			}

			let lastType = -1;
			let countEmptyLines = 0;

			let boundIndex = startIndex + currentItem.length;
			for (let j = boundIndex; j < lines.length; j++) {
				if (lines[j] === '' || lines[j] === '\r') {
					countEmptyLines++;
				} else {
					break;
				}
			}
			if (countEmptyLines > 1) {
				lines.splice(boundIndex + 1, countEmptyLines - 1);
			}

			for (let j = currentItem.length - 1; j >= 0; j--) {
				const line = lines[startIndex + j];
				const regex =
					/#(include\s+[<](?<inc1>[^>]+)[>])|(include\s+["](?<inc2>[^"]+)["])|(require\s+["](?<rec1>[^"]+)["])/gm;
				const r = regex.exec(line);
				let type = -1;
				if (r?.groups) {
					const inc1 = r.groups['inc1'];
					const inc2 = r.groups['inc2'];
					const rec1 = r.groups['rec1'];

					if (inc1) {
						type = 1;
						lines[startIndex + j] = '#include <' + inc1.toLowerCase() + '>';
					} else if (inc2) {
						type = 2;
					} else if (rec1) {
						type = 3;
					}
				}

				if (lastType > 0 && type > 0 && lastType !== type) {
					lines.splice(startIndex + j + 1, 0, '');
					boundIndex++;
				}
				lastType = type;
			}
		}
	}
}

function replaceAt(s: string, index: number, replacement: string) {
	return (
		s.substring(0, index) +
		replacement +
		s.substring(index + replacement.length)
	);
}

function compareLines(a: string, b: string): number {
	if (a.startsWith('#include') && b.startsWith('#include')) {
		if (a.indexOf(' "') > 0 && b.indexOf(' <') > 0) {
			return 1;
		} else if (a.indexOf(' <') > 0 && b.indexOf(' "') > 0) {
			return -1;
		}
	}
	return a.localeCompare(b);
}
