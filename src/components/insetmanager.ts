import * as vscode from 'vscode'
import {MathPreview} from './mathpreview'
import {Extension} from '../main'

export class MathPreviewInsetManager {
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
            const range = new vscode.Range(0, 0, 0, 1)
            try {
                const inset = vscode.window.createWebviewTextEditorInset(editor, range)
                this.previewInsets.set(document, inset)
                inset.webview.html = 'abc'
                return inset
            } catch (e) {
                console.log(e)
            }
        }
        return
    }

    updateMathPreviewInset(document: vscode.TextDocument) {
        const inset = this.previewInsets.get(document)
        if (!inset) {
            return
        }
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const position = editor.selection.active
        const texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        if (!texMath) {
            return
        }
        const svgDataUrl = this.mathPreview.generateSVG(document, texMath)
        return inset.webview.postMessage(svgDataUrl)
    }
}
