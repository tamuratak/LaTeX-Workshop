import * as vscode from 'vscode'
import * as path from 'path'
import {MathPreview, TexMathEnv} from '../providers/preview/mathpreview'
import {Extension} from '../main'


export class MathPreviewPanel {
    extension: Extension
    mathPreview: MathPreview
    panel?: vscode.WebviewPanel

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = extension.mathPreview
    }

    open() {
        if (this.panel) {
            if (!this.panel.visible) {
                this.panel.reveal(undefined, true)
            }
            return
        }
        const panel = vscode.window.createWebviewPanel(
            'latex-workshop-mathpreview',
            'Math Preview',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        )
        panel.onDidDispose(() => {
            this.panel = undefined
        })
        const jsPath = vscode.Uri.file(path.join(this.extension.extensionRoot, './resources/mathpreviewpanel/mathpreview.js'))
        const jsPathSrc = panel.webview.asWebviewUri(jsPath)
        panel.webview.html = this.getHtml(jsPathSrc)
        this.panel = panel
        panel.webview.onDidReceiveMessage(() => this.update())
    }

    close() {
        this.panel?.dispose()
        this.panel = undefined
    }

    getHtml(jsPathSrc: vscode.Uri) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src vscode-resource:; img-src data:; style-src 'unsafe-inline';">
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                }
                #mathBlock {
                    width: 100%;
                }
                #math {
                    visibility: hidden;
                    position: relative;
                    display: block;
                }
            </style>
            <script src='${jsPathSrc}' defer></script>
        </head>
        <body>
            <div id="mathBlock"><img src="" id="math" /></div>
        </body>
        </html>`
    }

    async update() {
        if (!this.panel) {
            return
        }
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || document?.languageId !== 'latex') {
            return
        }
        const position = editor.selection.active
        const texMath = this.getTexMath(document, position)
        if (!texMath) {
            return
        }
        const svgDataUrl = await this.mathPreview.generateSVG(document, texMath)
        return this.panel.webview.postMessage({type: 'mathImage', src: svgDataUrl })
    }

    getTexMath(document: vscode.TextDocument, position: vscode.Position) {
        const texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        if (texMath) {
            // this.renderCursor(document, texMath)
            if (texMath.envname !== '$') {
                return texMath
            }
            if (texMath.range.start.character !== position.character && texMath.range.end.character !== position.character) {
                return texMath
            }
        }
        return
    }

    renderCursor(document: vscode.TextDocument, tex: TexMathEnv) {
        const s = this.mathPreview.renderCursor(document, tex.range)
        tex.texString = s
    }

}
