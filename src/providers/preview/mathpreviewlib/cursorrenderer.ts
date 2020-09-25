import * as vscode from 'vscode'
import type {Extension} from '../../../main'
import {TexMathEnv} from './texmathenvfinder'


export class CursorRenderer {
    private readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    private isCursorInTeXCommand(document: vscode.TextDocument): boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    insertCursor(texMath: TexMathEnv, pos: vscode.Position, cursor: string) {
        const arry = texMath.texString.split('\n')
        const line = pos.line - texMath.range.start.line
        const curLine = arry[line]
        arry[line] = curLine.substring(0, pos.character) + cursor + curLine.substring(pos.character, curLine.length)
        return arry.join('\n')
    }

    renderCursor(document: vscode.TextDocument, texMath: TexMathEnv, thisColor: string): string {
        const range = texMath.range
        const cursor = vscode.window.activeTextEditor?.selection.active
        if (!cursor || !range.contains(cursor) || range.start.isEqual(cursor) || range.end.isEqual(cursor)) {
            return texMath.texString
        }
        this.extension.pegParser.parseLatex(texMath.texString).then(s => console.log(JSON.stringify(s)))
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const conf = configuration.get('hover.preview.cursor.enabled') as boolean
        if (!conf || this.isCursorInTeXCommand(document)) {
            return texMath.texString
        }
        const symbol = configuration.get('hover.preview.cursor.symbol') as string
        const color = configuration.get('hover.preview.cursor.color') as string
        const sym = color === 'auto' ? `{\\color{${thisColor}}${symbol}}` : `{\\color{${color}}${symbol}}`
        return this.insertCursor(texMath, cursor, sym)
    }

}
