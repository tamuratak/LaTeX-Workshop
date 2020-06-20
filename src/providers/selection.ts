import {latexParser} from 'latex-utensils'
import * as vscode from 'vscode'
import {SelectionRange, SelectionRangeProvider, TextDocument, Position} from 'vscode'

import {Extension} from '../main'


function toVscodeRange(loc: latexParser.Location) {
    return new vscode.Range(loc.start.line-1, loc.start.column-1, loc.end.line-1, loc.end.column-1)
}

export class SelectionProvider implements SelectionRangeProvider {

    constructor(private readonly extension: Extension) {}

    async provideSelectionRanges(document: TextDocument, positions: Position[]) {
        const content = document.getText()
        const latexAst = await this.extension.pegParser.parseLatex(content)
        if (!latexAst) {
            return []
        }
        const ret: SelectionRange[] = []
        positions.forEach(pos0 => {
            const pos = {line: pos0.line + 1, column: pos0.character + 1}
            const result = latexParser.findNodeAt(latexAst.content, pos)
            const selectionRange = this.resultToRange(result)
            if (selectionRange) {
                ret.push(selectionRange)
            }
        })
        return ret
    }

    resultToRange(result: ReturnType<typeof latexParser.findNodeAt>): SelectionRange | undefined {
        if (!result) {
            return
        }
        let parentRange: SelectionRange | undefined
        if (result.parent) {
            parentRange = this.resultToRange(result.parent)
        }
        if (!result.node.location) {
            return parentRange
        }
        const curRange = toVscodeRange(result.node.location)
        return new SelectionRange(curRange, parentRange)
    }
}
