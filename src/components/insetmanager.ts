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
        const position0 = editor.selection.active
        const position1 = new vscode.Position(position0.line + 1, position0.character + 5)
        const prev = this.previewInsets.get(document)
        if (prev) {
            this.previewInsets.delete(document)
            prev.dispose()
        } else {
            const range = new vscode.Range(position0, position1)
            try {
                const inset = vscode.window.createWebviewTextEditorInset(editor, range, {enableScripts: true})
                this.previewInsets.set(document, inset)
                inset.webview.html = `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline';">
                    <meta charset="UTF-8">
                    <script>
                    window.addEventListener('message', event => {
                        const message = event.data; // The JSON data our extension sent
                        const img = document.getElementById('math');
                        img.src = message;
                    });
                    </script>
                </head>
                <body>
                    <div style="text-align:center;"><img src="" id="math" /></div>
                </body>
                </html>`
                return inset
            } catch (e) {
                console.log(e)
            }
        }
        return
    }

    async updateMathPreviewInset(document: vscode.TextDocument) {
        const inset = this.previewInsets.get(document)
        if (!inset) {
            return
        }
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const position = editor.selection.active
        let texMath = this.mathPreview.findMathEnvOnBeginEnvname(document, position)
        if (!texMath) {
            texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        }
        if (!texMath) {
            return
        }
        const svgDataUrl = await this.mathPreview.generateSVG(document, texMath)
        return inset.webview.postMessage(svgDataUrl)
    }
}
