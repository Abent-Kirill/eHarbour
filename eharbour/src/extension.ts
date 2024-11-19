import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as oniguruma from 'vscode-oniguruma-wasm'
import * as vsTextmate from 'vscode-textmate'
import { ScopeName } from 'vscode-textmate/release/theme'

let vscodeOnigurumaLibPromise: Promise<vsTextmate.IOnigLib>

interface IConfFormatter {
	formatter: {
		replace: {
			logical: boolean
			cycle: boolean
			methods: boolean
		}
	}
}

interface IMetaContext {
	parent?: IMetaContext
	childern: IMetaContext[]
	definitions: string[]
	states: number[]
	isInvert: boolean
	startName: string
}

interface ISelectionPos {
	startRow: number
	endRow: number
}

interface ISpaceCorrectorInfo {
	index: number
	changeCount: number
	newString: string
}

interface IDictionary {
	[key: string]: string
}

const shortNames: IDictionary = {
	sele: 'select',
	select: 'select',
	devi: 'device',
	device: 'device',
	scre: 'screen',
	screen: 'screen',
	comm: 'commit',
	commit: 'commit',
}

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('eharbour.format', () => {
		const editor = vscode.window.activeTextEditor

		if (editor) {
			const document = editor.document
			if (!path.extname(document.fileName).toLowerCase().endsWith('.prg')) {
				vscode.window.showInformationMessage(
					'Для форматирование поддерживаются только файлы с расширением .prg',
				)
				return
			}

			var text = editor.document.getText()
			var conf: IConfFormatter = {
				formatter: {
					replace: {
						cycle: true,
						logical: true,
						methods: true,
					},
				},
			}
			var firstLine = editor.document.lineAt(0)
			var lastLine = editor.document.lineAt(editor.document.lineCount - 1)
			var textRange = new vscode.Range(
				firstLine.range.start,
				lastLine.range.end,
			)
			var startSelection = editor.selection.start
			var endSelection = editor.selection.end
			var pos: ISelectionPos | null
			if (
				startSelection.character === endSelection.character &&
				startSelection.line === endSelection.line
			) {
				pos = null
			} else {
				pos = { startRow: startSelection.line, endRow: endSelection.line + 1 }
			}

			vscode.window.showInformationMessage('Начат процесс форматирования кода')
			naiveFormat1(text, conf, pos).then((formattedText) => {
				if (text !== formattedText) {
					editor.edit((editBuilder) => {
						editBuilder.delete(textRange)
						editBuilder.insert(new vscode.Position(0, 0), formattedText)
					})
				}
				vscode.window.showInformationMessage('Код отформатирован')
			})

			const updatedText = text.replace(/,(\S)/g, ', $1')

			editor.edit((editBuilder) => {
				editBuilder.replace(textRange, updatedText)
			})
		}
	})

	context.subscriptions.push(disposable)
}

export function deactivate() {}

const IS_FUNCTION = 0
const IS_IF = 1
const IS_CYCLE = 2
const IS_CASE = 3
const IS_CLASS = 4
const IS_SWITCH = 5
const IS_SEQUENCE = 6

const tabSize = 4

//const wasmBin = fs.readFileSync(path.join(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const wasmBin = fs.readFileSync(
	path.join(__dirname, './oniguruma/onig.wasm'),
).buffer

function readFile(path: string) {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (error, data) => (error ? reject(error) : resolve(data)))
	})
}

const line_include_type = 1
const line_required_type = 2
const line_ifDef_type = 3

interface ILineType {
	index: number
	type: number
}

function naiveFormat1(
	code: string,
	harbour: IConfFormatter,
	selectionPos: ISelectionPos | null,
): Promise<string> {
	// Проверяем, был ли уже загружен WASM
	if (!vscodeOnigurumaLibPromise) {
		// Инициализируем только один раз
		vscodeOnigurumaLibPromise = oniguruma.loadWASM(wasmBin).then(() => {
			return {
				createOnigScanner(patterns: string[]) {
					return new oniguruma.OnigScanner(patterns)
				},
				createOnigString(s: string) {
					return new oniguruma.OnigString(s)
				},
			}
		})
	}

	const registry = new vsTextmate.Registry({
		onigLib: vscodeOnigurumaLibPromise!,
		loadGrammar: async (
			scopeName: ScopeName,
		): Promise<vsTextmate.IRawGrammar | undefined | null> => {
			if (scopeName === 'source.harbour') {
				try {
					var fileName = path.join(
						__dirname,
						'./syntaxes/harbour.tmLanguage.json',
					)
					const data: any = await readFile(fileName)
					return vsTextmate.parseRawGrammar(data.toString(), fileName)
				} catch (ex) {
					console.error(ex)
				}
			}
			console.log(`Unknown scope name: ${scopeName}`)
			return null
		},
	})

	let configuration = vscode.workspace.getConfiguration('eharbour')
	var procs1 = configuration.get<string[]>('proceduresname', [])

	var replaceIf = harbour.formatter.replace.logical
	var replaceCycle = harbour.formatter.replace.cycle
	var replaceMethod = harbour.formatter.replace.methods
	var procsFileName = path.join(__dirname, './syntaxes/HarbourProcsExt.txt')
	const procsData: string = fs.readFileSync(procsFileName, 'utf8')
	var procs = procsData.replaceAll('\r', '').split('\n')
	var procsHash: IDictionary = {}

	for (var i = 0; i < procs.length; i++) {
		var line: string = procs[i]
		if (!!line) {
			procsHash[line.toLowerCase()] = line
		}
	}

	if (!!procs1) {
		for (var i = 0; i < procs1.length; i++) {
			var line: string = procs1[i]
			if (!!line) {
				procsHash[line.toLowerCase()] = line
			}
		}
	}

	var result = new Promise<string>((resolver, reject) => {
		registry
			.loadGrammar('source.harbour')
			.then((grammar: vsTextmate.IGrammar | null) => {
				try {
					if (grammar !== null) {
						var globalState: IMetaContext = {
							childern: [],
							definitions: [],
							states: [],
							isInvert: false,
							startName: '',
						}

						var lines = code.replace('\r', '').split('\n')
						var specLineTypes: ILineType[] = []
						var hasSpecLineTypes = false
						var startRow, endRow: number
						if (selectionPos === null) {
							startRow = 0
							endRow = lines.length
						} else {
							startRow = selectionPos.startRow
							endRow = selectionPos.endRow
						}

						var currentState = globalState

						let ruleStack = vsTextmate.INITIAL
						var metaEvalution: number[] = []
						for (let i = 0; i < lines.length; i++) {
							var correctspaces: ISpaceCorrectorInfo[] = []
							var states = currentState.states

							var lastStateIndex = states.length
							var lastState =
								lastStateIndex > 0 ? states[lastStateIndex - 1] : -1

							var inFunction = lastState === IS_FUNCTION
							var inCase = lastState === IS_CASE
							var inClass = lastState === IS_CLASS

							var line = lines[i].trim()
							if (line === '') {
								continue
							}
							const lineTokens = grammar.tokenizeLine(line, ruleStack)
							//console.log(`\nTokenizing line: ${line} ${i+1}`);

							if (i < startRow || i >= endRow) {
								continue
							}
							var backIndent = false
							var spaceCount: number
							if (backIndent) {
								spaceCount = states.length - 1
							} else {
								spaceCount = states.length
							}
							var isC = false
							for (let j = 0; j < lineTokens.tokens.length; j++) {
								const token = lineTokens.tokens[j]
								var scopes = token.scopes
								console.log(
									`${i + 1},${j} - token from ${token.startIndex} to ${
										token.endIndex
									} ` +
										`(${line.substring(token.startIndex, token.endIndex)}) ` +
										`with scopes ${scopes.join(', ')}`,
								)

								var handled = false

								scopes.shift()

								var checkF = function (...strings: string[]): boolean {
									for (var i = 0; i < scopes.length; i++) {
										for (var j = 0; j < strings.length; j++) {
											if (scopes[i] === strings[j]) {
												return true
											}
										}
									}
									return false
								}

								var checkFP = function (
									scopes: string[],
									...strings: string[]
								): boolean {
									for (var i = 0; i < scopes.length; i++) {
										for (var j = 0; j < strings.length; j++) {
											if (scopes[i] === strings[j]) {
												return true
											}
										}
									}
									return false
								}
								var formatF = function (start: number, end: number) {
									var lower = line.substring(start, end).toLocaleLowerCase()
									line = line.substring(0, start) + lower + line.substring(end)
								}

								if (checkF('source.c.embedded.harbour')) {
									isC = true
									if (line.startsWith('#include')) {
										specLineTypes.push({ index: i, type: line_include_type })
										hasSpecLineTypes = true
									} else if (line.startsWith('#require')) {
										specLineTypes.push({ index: i, type: line_required_type })
										hasSpecLineTypes = true
									}
									break
								}
								if (j === 0) {
									if (checkF('keyword.setcolor.harbour')) {
										handled = true
										break
									}
									if (
										checkF('comment.block.harbour') &&
										line.indexOf('/*') < 0 &&
										line.indexOf('*/') < 0
									) {
										spaceCount++
										handled = true
										break
									}
									if (line.startsWith('#include')) {
										specLineTypes.push({ index: i, type: line_include_type })
										hasSpecLineTypes = true
										handled = true
										break
									} else if (line.startsWith('#require')) {
										specLineTypes.push({ index: i, type: line_required_type })
										hasSpecLineTypes = true
										handled = true
										break
									} else if (
										checkF('keyword.control.directive.conditional.harbour')
									) {
										const ifDefCondition =
											/^(?<ifdef>#ifdef\s+(?<name>\w+))|(?<ifndef>#ifndef\s+(?<name1>\w+))/i.exec(
												line,
											)
										if (ifDefCondition && ifDefCondition.groups) {
											specLineTypes.push({ index: i, type: line_ifDef_type })
											var name = ifDefCondition.groups['name']
											var name1 = ifDefCondition.groups['name1']
											var currentName = name ?? name1

											var invert = !!name1
											var newStateTrue: IMetaContext = {
												childern: [],
												parent: currentState,
												states: [...currentState.states],
												definitions: [...currentState.definitions],
												isInvert: false,
												startName: currentName,
											}
											currentState.childern.push(newStateTrue)

											var newStateFalse: IMetaContext = {
												childern: [],
												parent: currentState,
												states: [...currentState.states],
												definitions: [...currentState.definitions],
												isInvert: true,
												startName: currentName,
											}
											currentState.childern.push(newStateFalse)

											currentState = invert ? newStateFalse : newStateTrue

											if (newStateTrue.definitions.indexOf(currentName) < 0) {
												newStateTrue.definitions.push(currentName)
											}
										} else {
											var defineDefCondition = /^#define\s+(?<name>\w+)/i.exec(
												line,
											)
											if (defineDefCondition && defineDefCondition.groups) {
												var name = defineDefCondition.groups['name']
												currentState.definitions.push(name)
											} else if (line.toLowerCase().startsWith('#else')) {
												specLineTypes.push({ index: i, type: line_ifDef_type })
												var index =
													currentState.parent!.childern.indexOf(currentState)
												if (currentState.isInvert) {
													currentState =
														currentState.parent!.childern[index - 1]
												} else {
													currentState =
														currentState.parent!.childern[index + 1]
												}
											} else if (line.toLowerCase().startsWith('#endif')) {
												if (currentState?.parent) {
													specLineTypes.push({
														index: i,
														type: line_ifDef_type,
													})
													currentState.parent.definitions =
														currentState.definitions
													currentState = currentState?.parent
												}
											}
										}
										spaceCount = 0
										handled = true
										break
									} else if (checkF('meta.preprocessor.pragma.harbour')) {
										specLineTypes.push({ index: i, type: line_ifDef_type })
										spaceCount = 0
										handled = true
										break
									} else if (
										checkF('keyword.else.harbour', 'keyword.elseif.harbour')
									) {
										if (replaceIf) {
											formatF(token.startIndex, token.endIndex)
										}
										spaceCount = states.length - 1
									} else if (
										checkF('meta.array.harbour') &&
										!checkF('punctuation.section.array.end.harbour')
									) {
										spaceCount = states.length + 1
									} else if (
										inFunction &&
										checkF(
											'meta.definition.variable.local.harbour',
											'meta.definition.variable.memvar.harbour',
											'meta.definition.variable.public.harbour',
											'meta.parameters.harbour',
											'meta.definition.variable.static.harbour',
											'meta.definition.variable.private.harbour',
										)
									) {
										spaceCount = Math.max(0, states.length - 1)
										//handled = true;
										//break;
									} else if (inClass && checkF('storage.modifier.harbour')) {
										spaceCount = Math.max(0, states.length - 1)
										handled = true
										break
									} else if (checkF('keyword.recover.harbour')) {
										spaceCount = Math.max(0, states.length - 1)
										handled = true
										break
									} else if (checkF('keyword.if.harbour')) {
										if (replaceIf) {
											formatF(token.startIndex, token.endIndex)
										}
										states.push(IS_IF)
										handled = true
									} else if (
										checkF('keyword.while.harbour', 'keyword.for.harbour')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex)
											for (let p = 1; p < lineTokens.tokens.length; p++) {
												const ctoken = lineTokens.tokens[p]

												var cscopes = ctoken.scopes
												if (checkFP(cscopes, 'keyword.to.harbour')) {
													formatF(ctoken.startIndex, ctoken.endIndex)
												}

												//console.log(` - token from ${ctoken.startIndex} to ${ctoken.endIndex} ` +`(${line.substring(ctoken.startIndex, ctoken.endIndex)}) ` +`with scopes ${cscopes.join(', ')}`);
											}
										}
										states.push(IS_CYCLE)

										break
									}
								}

								if (!handled) {
									if (checkF('meta.macro-exp.harbour')) {
										if (checkF('punctuation.definition.macro-exp.harbour')) {
											var itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											)
											if (itemLine === '&') {
												metaEvalution.push(0)
											}
										} else if (
											checkF(
												'punctuation.definition.begin.bracket.round.harbour',
											)
										) {
											if (metaEvalution.length > 0) {
												metaEvalution[metaEvalution.length - 1]++
											}
										} else if (
											checkF('punctuation.definition.end.bracket.round.harbour')
										) {
											if (metaEvalution.length > 0) {
												var index = metaEvalution.length - 1
												metaEvalution[index]--
												if (metaEvalution[index] <= 0) {
													metaEvalution.pop()
												}
											}
										}
									}
									if (checkF('meta.function-call.harbour')) {
										if (checkF('entity.name.function.harbour')) {
											var itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											)
											var procName = procsHash[itemLine.toLowerCase()]
											if (!!procName && itemLine !== procName) {
												line = replaceAt(line, token.startIndex, procName)
											}
										} else if (checkF('keyword.if.harbour')) {
											var itemLine = line.substring(
												token.startIndex,
												token.endIndex,
											)
											if (itemLine !== 'If') {
												line = replaceAt(line, token.startIndex, 'If')
											}
										}
									}

									if (checkF('keyword.begin.harbour')) {
										spaceCount = states.length
										states.push(IS_SEQUENCE)
									} else if (checkF('keyword.endsequence.harbour')) {
										states.pop()
										spaceCount = states.length
									} else if (checkF('keyword.class.class.harbour')) {
										states = currentState.states = [IS_CLASS]
										spaceCount = 0
									} else if (checkF('keyword.end.class.harbour')) {
										states.pop()
										spaceCount = states.length
									} else if (
										checkF('keyword.type.method.harbour') &&
										scopes[0] === 'meta.method.declaration.harbour'
									) {
										if (replaceMethod) {
											formatF(token.startIndex, token.endIndex)
										}
										spaceCount = 0
										states = currentState.states = [IS_FUNCTION]
									} else if (checkF('keyword.type.function.harbour')) {
										if (replaceMethod) {
											formatF(token.startIndex, token.endIndex)
										}
										spaceCount = 0

										states = currentState.states = [IS_FUNCTION]
									} else if (inFunction && checkF('keyword.return.harbour')) {
										if (replaceMethod) {
											formatF(token.startIndex, token.endIndex)
										}
										states.pop()
										spaceCount = states.length
									} else if (
										checkF('keyword.switch.harbour') ||
										(checkF('keyword.case.harbour') &&
											line.toLowerCase().indexOf('do ') >= 0)
									) {
										if (replaceIf) {
											formatF(0, token.endIndex)
										}
										states.push(IS_SWITCH)
										spaceCount = states.length - 1
									} else if (
										checkF(
											'keyword.endcase.harbour',
											'keyword.endswitch.harbour',
										)
									) {
										if (replaceIf) {
											formatF(token.startIndex, token.endIndex)
										}
										if (inCase) {
											states.pop()
										}
										states.pop()

										spaceCount = states.length
									} else if (
										checkF('keyword.case.harbour') ||
										checkF('keyword.otherwise.harbour')
									) {
										if (replaceIf) {
											formatF(token.startIndex, token.endIndex)
										}
										if (!inCase) {
											states.push(IS_CASE)
										}
										spaceCount = states.length - 1
									} else if (
										checkF('keyword.while.harbour') &&
										line.toLowerCase().startsWith('do ')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex)
										}
										states.push(IS_CYCLE)
										break
									} else if (
										checkF('keyword.enddo.harbour', 'keyword.next.harbour')
									) {
										if (replaceCycle) {
											formatF(token.startIndex, token.endIndex)
										}
										states.pop()
										spaceCount = states.length
									} else if (checkF('keyword.endif.harbour')) {
										if (replaceIf) {
											formatF(token.startIndex, token.endIndex)
										}
										states.pop()
										spaceCount = states.length
									} else if (
										checkF(
											'keyword.operator.logical.harbour',
											'keyword.operator.comparison.harbour',
											'keyword.operator.arithmetic.harbour',
											'keyword.operator.assignment.harbour',
											'keyword.operator.assignment.augmented.harbour',
										)
									) {
										if (metaEvalution.length > 0) {
											var {
												countSpaces,
												c,
											}: { countSpaces: number; c: number } = AddSpaces(
												token,
												line,
												correctspaces,
												0,
											)
										} else {
											var {
												countSpaces,
												c,
											}: { countSpaces: number; c: number } = AddSpaces(
												token,
												line,
												correctspaces,
												1,
											)
										}
									} else if (checkF('punctuation.separator.comma.harbour')) {
										var countSpaces = 0
										for (c = token.endIndex; c < line.length; c++) {
											if (line[c] === ' ') {
												countSpaces++
											} else {
												break
											}
										}
										if (metaEvalution.length === 0) {
											if (countSpaces > 1) {
												correctspaces.push({
													index: c - 1,
													changeCount: countSpaces - 1,
													newString: '',
												})
											} else if (countSpaces === 0) {
												correctspaces.push({
													index: token.endIndex,
													changeCount: 0,
													newString: ' ',
												})
											}
										} else {
										}
									} else if (scopes.length === 0) {
										var s = line.substring(token.startIndex, token.endIndex)
										var strs = s.split(' ')
										var strsIndex = token.startIndex
										for (var p = 0; p < strs.length; p++) {
											var key = strs[p].toLowerCase()

											var fullS = shortNames[key]
											if (fullS) {
												correctspaces.push({
													index: strsIndex,
													changeCount: key.length,
													newString: fullS,
												})
											}
											strsIndex += key.length + 1
										}
									}
								}
							}
							if (correctspaces.length > 0) {
								for (
									var cIndex = correctspaces.length - 1;
									cIndex >= 0;
									cIndex--
								) {
									var item = correctspaces[cIndex]
									var s1 = line.substring(0, item.index)
									var s2 = line.substring(item.index + item.changeCount)
									if (item.newString.length > 0) {
										line = s1 + item.newString + s2
									} else {
										line = s1 + s2
									}
								}
							}
							if (isC) {
								continue
							}

							lines[i] = ' '.repeat(spaceCount * tabSize) + line
							ruleStack = lineTokens.ruleStack
						}
						if (hasSpecLineTypes) {
							sortLines(lines, specLineTypes)
						}

						resolver(lines.join('\n'))
					}
				} catch (ex) {
					reject(ex)
				}
			})
	})

	return result
}

function AddSpaces(
	token: vsTextmate.IToken,
	line: string,
	correctspaces: ISpaceCorrectorInfo[],
	maxSpaces: number,
) {
	var countSpaces = 0
	var c: number = 0
	for (c = token.startIndex - 1; c >= 0; c--) {
		if (line[c] === ' ') {
			countSpaces++
		} else {
			break
		}
	}
	if (
		correctspaces.length === 0 ||
		correctspaces[correctspaces.length - 1].index !== token.startIndex
	) {
		if (countSpaces > maxSpaces) {
			correctspaces.push({
				index: token.startIndex - (countSpaces - maxSpaces),
				changeCount: countSpaces - maxSpaces,
				newString: '',
			})
		} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
			correctspaces.push({
				index: token.startIndex,
				changeCount: 0,
				newString: ' '.repeat(maxSpaces - countSpaces),
			})
		}
	}
	var countSpaces = 0
	for (c = token.endIndex; c < line.length; c++) {
		if (line[c] === ' ') {
			countSpaces++
		} else {
			break
		}
	}
	if (countSpaces > maxSpaces) {
		correctspaces.push({
			index: c - 1,
			changeCount: countSpaces - maxSpaces,
			newString: '',
		})
	} else if (maxSpaces > 0 && countSpaces < maxSpaces) {
		correctspaces.push({
			index: token.endIndex,
			changeCount: 0,
			newString: ' '.repeat(maxSpaces - countSpaces),
		})
	}
	return { countSpaces, c }
}

function sortLines(lines: string[], specLineTypes: ILineType[]) {
	var blocks: ILineType[][] = []
	var currentItem: ILineType[] = []

	for (var i = 0; i < specLineTypes.length; i++) {
		var item = specLineTypes[i]
		if (item.type === line_ifDef_type) {
			if (currentItem.length > 0) {
				blocks.push(currentItem)
				currentItem = []
			}
		} else {
			currentItem.push(item)
		}
	}
	if (currentItem.length > 0) {
		blocks.push(currentItem)
	}

	//Перемещение спецстрок в одну кучу
	for (var i = blocks.length - 1; i >= 0; i--) {
		currentItem = blocks[i]

		if (currentItem.length > 1) {
			var lastIndex = -1
			var startIndex = currentItem[0].index
			var otherLines: string[] = []
			for (var j = currentItem.length - 1; j >= 1; j--) {
				var rowIndex = currentItem[j].index
				otherLines.push(lines[rowIndex])
				lines[rowIndex] = ''
				if (lastIndex >= 0) {
					for (var k = lastIndex; k > rowIndex; k--) {
						lines[k] = lines[k - 1]
					}
				}
				lastIndex = rowIndex
			}
			otherLines.push(lines[startIndex])
			otherLines.sort(compareLines)

			if (lastIndex >= 0) {
				for (var k = lastIndex; k > startIndex; k--) {
					lines[k] = lines[k - 1]
				}
			}
			for (var j = 0; j < currentItem.length; j++) {
				var rowIndex = startIndex + j
				lines[rowIndex] = otherLines[j]
			}

			var lastType: number = -1
			var countEmptyLines = 0

			var boundIndex = startIndex + currentItem.length
			for (var j = boundIndex; j < lines.length; j++) {
				if (lines[j] === '' || lines[j] === '\r') {
					countEmptyLines++
				} else {
					break
				}
			}
			if (countEmptyLines > 1) {
				lines.splice(boundIndex + 1, countEmptyLines - 1)
			}

			for (var j = currentItem.length - 1; j >= 0; j--) {
				var line = lines[startIndex + j]
				var regex =
					/#(include\s+[<](?<inc1>[^>]+)[>])|(include\s+["](?<inc2>[^"]+)["])|(require\s+["](?<rec1>[^"]+)["])/gm
				var r = regex.exec(line)
				var type: number = -1
				if (r?.groups) {
					var inc1 = r.groups['inc1']
					var inc2 = r.groups['inc2']
					var rec1 = r.groups['rec1']

					if (!!inc1) {
						type = 1
						lines[startIndex + j] = '#include <' + inc1.toLowerCase() + '>'
					} else if (!!inc2) {
						type = 2
					} else if (!!rec1) {
						type = 3
					}
				}

				if (lastType > 0 && type > 0 && lastType !== type) {
					lines.splice(startIndex + j + 1, 0, '')
					boundIndex++
				}
				lastType = type
			}
		}
	}
}

function replaceAt(s: string, index: number, replacement: string) {
	return (
		s.substring(0, index) +
		replacement +
		s.substring(index + replacement.length)
	)
}

function compareLines(a: string, b: string): number {
	if (a.startsWith('#include') && b.startsWith('#include')) {
		if (a.indexOf(' "') > 0 && b.indexOf(' <') > 0) {
			return 1
		} else if (a.indexOf(' <') > 0 && b.indexOf(' "') > 0) {
			return -1
		}
	}
	return a.localeCompare(b)
}

