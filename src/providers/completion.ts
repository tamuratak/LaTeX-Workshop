import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import {Extension} from '../main'
import {Citation} from './completer/citation'
import {Command} from './completer/command'
import {Environment} from './completer/environment'
import {Reference} from './completer/reference'
import {Package} from './completer/package'
import {Input} from './completer/input'
import {TexMathEnv} from './hover'

export class Completer implements vscode.CompletionItemProvider {
    extension: Extension
    citation: Citation
    command: Command
    environment: Environment
    reference: Reference
    package: Package
    input: Input

    constructor(extension: Extension) {
        this.extension = extension
        this.citation = new Citation(extension)
        this.command = new Command(extension)
        this.environment = new Environment(extension)
        this.reference = new Reference(extension)
        this.package = new Package(extension)
        this.input = new Input(extension)
        let defaultEnvs: string
        let defaultCommands: string
        fs.readFile(`${this.extension.extensionRoot}/data/environments.json`)
            .then(data => {defaultEnvs = data.toString()})
            .then(() => fs.readFile(`${this.extension.extensionRoot}/data/commands.json`))
            .then(data => {defaultCommands = data.toString()})
            .then(() => {
                const env = JSON.parse(defaultEnvs)
                this.command.initialize(JSON.parse(defaultCommands), env)
                this.environment.initialize(env)
            })
            .catch(err => this.extension.logger.addLogMessage(`Error reading data: ${err}.`))
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) : Promise<vscode.CompletionItem[]> {
        return new Promise((resolve, _reject) => {
            const invokeChar = document.lineAt(position.line).text[position.character - 1]
            const currentLine = document.lineAt(position.line).text
            if (position.character > 1 && currentLine[position.character - 1] === '\\' && currentLine[position.character - 2] === '\\') {
                resolve()
                return
            }
            if (this.command.specialBrackets && this.command.specialBrackets.hasOwnProperty(invokeChar)) {
                if (position.character > 1 && currentLine[position.character - 2] === '\\') {
                    const mathSnippet = Object.assign({}, this.command.specialBrackets[invokeChar])
                    if (vscode.workspace.getConfiguration('editor', document.uri).get('autoClosingBrackets') &&
                        (currentLine.length > position.character && [')', ']', '}'].indexOf(currentLine[position.character]) > -1)) {
                        mathSnippet.range = new vscode.Range(position.translate(0, -1), position.translate(0, 1))
                    } else {
                        mathSnippet.range = new vscode.Range(position.translate(0, -1), position)
                    }
                    resolve([mathSnippet])
                    return
                }
            }

            const line = document.lineAt(position.line).text.substr(0, position.character)
            for (const type of ['citation', 'reference', 'environment', 'package', 'input', 'command']) {
                const suggestions = this.completion(type, line, {document, position, token, context})
                if (suggestions.length > 0) {
                    if (type === 'citation') {
                        const configuration = vscode.workspace.getConfiguration('latex-workshop')
                        if (configuration.get('intellisense.citation.type') as string === 'browser') {
                            resolve()
                            setTimeout(() => this.citation.browser({document, position, token, context}), 10)
                            return
                        }
                    } else if (type === 'command') {
                        const configuration = vscode.workspace.getConfiguration('latex-workshop')
                        if (configuration.get('intellisense.surroundCommand.enabled') && this.command.selection.length > 0) {
                            resolve()
                            setTimeout(() => {
                                this.command.surround(this.command.selection)
                                this.command.selection = ''
                                this.command.shouldClearSelection = true
                            }, 10)
                            return
                        }
                    }
                    resolve(suggestions)
                    return
                }
            }
            resolve()
        })
    }

    async resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken) : Promise<vscode.CompletionItem> {
        if (item.kind === vscode.CompletionItemKind.Reference) {
            if (typeof item.documentation !== 'string') {
                return item
            }
            const doc = JSON.parse(item.documentation)
            if (typeof doc === 'string') {
                return item
            }
            if (doc.texString !== undefined) {
                const tex: TexMathEnv = doc
                const ret = await this.extension.mathPreview.getSvgDataUrlOnRef(tex, item.label)
                item.documentation = new vscode.MarkdownString(`![equation](${ret.svgDataUrl})`)
                return item
            }

        }
        return item
    }

    completion(type: string, line: string, args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) : vscode.CompletionItem[] {
        let reg
        let provider
        let payload
        switch (type) {
            case 'citation':
                reg = /(?:\\[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?(?:\[[^\[\]]*\])*){([^}]*)$/
                provider = this.citation
                break
            case 'reference':
                reg = /(?:\\hyperref\[([^\]]*)(?!\])$)|(?:(?:\\(?!hyper)[a-zA-Z]*ref[a-zA-Z]*\*?(?:\[[^\[\]]*\])?){([^}]*)$)/
                provider = this.reference
                break
            case 'environment':
                reg = /(?:\\begin(?:\[[^\[\]]*\])?){([^}]*)$/
                provider = this.environment
                break
            case 'command':
                reg = /\\([a-zA-Z]*)$/
                provider = this.command
                break
            case 'package':
                reg = /(?:\\usepackage(?:\[[^\[\]]*\])*){([^}]*)$/
                provider = this.package
                break
            case 'input':
                reg = /(?:\\(input|include|subfile|includegraphics)(?:\[[^\[\]]*\])*){([^}]*)$/
                provider = this.input
                break
            default:
                // This shouldn't be possible, so mark as error case in log.
                this.extension.logger.addLogMessage(`Error - trying to complete unknown type ${type}`)
                return []
        }
        const result = line.match(reg)
        let suggestions: vscode.CompletionItem[] = []
        if (result) {
            if (type === 'input') {
                const editor = vscode.window.activeTextEditor
                if (editor) {
                    payload = [result[1], editor.document.fileName, result[2]]
                }
            } else if (type === 'reference' || type === 'citation') {
                payload = args
            }
            suggestions = provider.provide(payload)
        }
        return suggestions
    }
}
