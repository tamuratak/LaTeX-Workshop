import * as vscode from 'vscode'

import {Extension} from '../main'
import {Section} from './structure'

export class DocSymbolProvider implements vscode.DocumentSymbolProvider {
    private readonly extension: Extension

    private sections: string[] = []

    constructor(extension: Extension) {
        this.extension = extension
        const rawSections = vscode.workspace.getConfiguration('latex-workshop').get('view.outline.sections') as string[]
        rawSections.forEach(section => {
            this.sections = this.sections.concat(section.split('|'))
        })
    }

    public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        return this.sectionToSymbols(await this.extension.structureProvider.buildModel(document.fileName, undefined, undefined, undefined, undefined, false))
    }

    private sectionToSymbols(sections: Section[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []

        sections.forEach(section => {
            const range = new vscode.Range(section.lineNumber, 0, section.toLine, 65535)
            const symbol = new vscode.DocumentSymbol(section.label ? section.label : 'empty', '', vscode.SymbolKind.String, range, range)
            symbols.push(symbol)
            if (section.children.length > 0) {
                symbol.children = this.sectionToSymbols(section.children)
            }
        })

        return symbols
    }

}
