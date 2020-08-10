import * as vscode from 'vscode'

import {Extension} from '../main'
import {Section} from './structure'

export class ProjectSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    public async provideWorkspaceSymbols(_query: string, _token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
        const symbols: vscode.SymbolInformation[] = []
        if (this.extension.manager.rootFile === undefined) {
            return symbols
        }
        this.sectionToSymbols(symbols, await this.extension.structureProvider.buildModel(this.extension.manager.rootFile))
        return symbols
    }

    private sectionToSymbols(symbols: vscode.SymbolInformation[], sections: Section[], containerName: string = 'Document') {
        sections.forEach(section => {
            const location = new vscode.Location(vscode.Uri.file(section.fileName), new vscode.Range(section.lineNumber, 0, section.toLine, 65535))
            symbols.push(new vscode.SymbolInformation(section.label, vscode.SymbolKind.String, containerName, location))
            if (section.children.length > 0) {
                this.sectionToSymbols(symbols, section.children, section.label)
            }
        })
    }
}
