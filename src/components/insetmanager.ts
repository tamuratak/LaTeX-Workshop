import * as vscode from 'vscode'
import {MathPreview} from './mathpreview'
import {Extension} from '../main'

type InsetInfo = {
    inset: vscode.WebviewEditorInset,
    left: number
}

export class MathPreviewInsetManager {
    extension: Extension
    mathPreview: MathPreview
    previewInsets: Map<vscode.TextDocument, InsetInfo>

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
        const position = editor.selection.active
        const prev = this.previewInsets.get(document)
        if (prev) {
            this.previewInsets.delete(document)
            prev.inset.dispose()
        } else {
            const [range, left] = this.calcInsetRangeAndLeft(document, position)
            try {
                const inset = vscode.window.createWebviewTextEditorInset(editor, range, {enableScripts: true})
                const insetInfo = {inset, left}
                this.previewInsets.set(document, insetInfo)
                inset.webview.onDidReceiveMessage((message) => {
                    console.log(message)
                })
                inset.webview.html = this.getImgHtml(left)
                return inset
            } catch (e) {
                console.log(e)
            }
        }
        return
    }

    calcInsetRangeAndLeft(document: vscode.TextDocument, position: vscode.Position) : [vscode.Range, number] {
        let texMath = this.mathPreview.findInlineMath(document, position)
        let posBegin = position
        let lineNumAsHeight: number
        let left = 0
        const editorWidth = 74
        if (texMath) {
            lineNumAsHeight = 3
            const col = texMath.range.start.character
            left = col / editorWidth * 100
        } else {
            lineNumAsHeight = 10
            texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
            if (texMath) {
                posBegin = texMath.range.end
            }
        }
        const posEnd = new vscode.Position(posBegin.line + lineNumAsHeight, 0)
        return [new vscode.Range(posBegin, posEnd), left]
    }

    getImgHtml(left: number) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline';">
            <meta charset="UTF-8">
            <script>
            window.addEventListener('message', event => {
                const message = event.data; // The JSON data our extension sent
                switch (message.type) {
                  case "mathImage":
                    const img = document.getElementById('math');
                    img.onload = () => {
                      const vscode = acquireVsCodeApi();
                      vscode.postMessage({
                          type: "sizeInfo",
                          window: {
                              width: window.innerWidth,
                              height: window.innerHeight
                          },
                          img: {
                              width: img.width,
                              height: img.height
                          }
                      })
                    }
                    img.src = message.src;
                    break;
                  default:
                    break;
                }
            });
            </script>
        </head>
        <body>
            <div style="width: 100%;"><img style="margin-top: 10px; position: relative; left: ${left}%;" src="" id="math" /></div>
        </body>
        </html>`
    }

    async updateMathPreviewInset(document: vscode.TextDocument) {
        const insetInfo = this.previewInsets.get(document)
        if (!insetInfo) {
            return
        }
        const inset = insetInfo.inset
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
        return inset.webview.postMessage({type: "mathImage", src: svgDataUrl})
    }
}
