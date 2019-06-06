import * as vscode from 'vscode'
import {MathPreview} from './mathpreview'
import {Extension} from '../main'

class MathPreviewInsetManager {
    extension: Extension
    mathPreview: MathPreview
    previewInsets: Map<vscode.TextDocument, vscode.WebviewEditorInset>

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = extension.mathPreview
        this.previewInsets = new Map()
    }

    toggleMathPreviewInset() {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const document = editor.document
        const prev = this.previewInsets.get(document)
        if (prev) {
            this.previewInsets.delete(document)
            prev.dispose()
        } else {
            const range = new vscode.Range(0,0,0,1)
            const inset = vscode.window.createWebviewTextEditorInset(editor, range)
            this.previewInsets.set(document, inset)
            return inset
        }
    }
}