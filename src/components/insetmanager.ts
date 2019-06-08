import * as vscode from 'vscode'
import {MathPreview, TexMathEnv} from './mathpreview'
import {Extension} from '../main'

type InsetInfo = {
    enabled: boolean,
    context?: {
        inset: vscode.WebviewEditorInset,
        curTexMath?: TexMathEnv
    }
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

    createMathPreviewInset(editor: vscode.TextEditor, lineHeight?: number) {
        const document = editor.document
        const position = editor.selection.active
        const [range, lineNumAsHeight] = this.calcInsetRangeAndLeft(document, position, lineHeight)
        try {
            const inset = vscode.window.createWebviewTextEditorInset(editor, range, {enableScripts: true})
            const insetInfo = {enabled: true, context: {inset}}
            this.previewInsets.set(document, insetInfo)
            inset.webview.onDidReceiveMessage( async (message) => {
                switch (message.type) {
                    case 'sizeInfo':
                        if (message.img.height > message.window.height) {
                            inset.dispose()
                            const lnHeight = message.img.height / message.window.height * lineNumAsHeight + 2
                            this.createMathPreviewInset(editor, lnHeight)
                            await this.updateMathPreviewInset(document)
                        }
                        break
                    default:
                        break
                }
            })
            inset.onDidDispose( () => {
                const info = this.previewInsets.get(document)
                if (info && info.context && info.context.inset === inset) {
                    info.context = undefined
                }
            })
            inset.webview.html = this.getImgHtml()
            return inset
        } catch (e) {
            console.log(e)
        }
        return
    }

    moveInsetIfNeeded(editor: vscode.TextEditor) {
        const document = editor.document
        const insetInfo = this.previewInsets.get(document)
        if (!insetInfo || !insetInfo.enabled) {
            return
        }
        const context = insetInfo.context
        const position = editor.selection.active
        if (context) {
            const curTexMath = context.curTexMath
            if (curTexMath) {
                if (curTexMath.range.contains(position)) {
                    return
                }
                if (curTexMath.envname === '$' && curTexMath.range.start.line === position.line) {
                    this.updateMathPreviewInset(document)
                    return
                }
            }
            insetInfo.context = undefined
            context.inset.dispose()
        }
        const texMath = this.getTexMath(document, position)
        if (!texMath) {
            return
        }
        this.createMathPreviewInset(editor)
        this.updateMathPreviewInset(document)
    }

    toggleMathPreviewInset() {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const document = editor.document
        const insetInfo = this.previewInsets.get(document)
        if (insetInfo && insetInfo.enabled) {
            insetInfo.enabled = false
            const context = insetInfo.context
            if (context) {
                context.inset.dispose()
                insetInfo.context = undefined
            }
        } else {
            return this.createMathPreviewInset(editor)
        }
        return
    }

    calcInsetRangeAndLeft(document: vscode.TextDocument, position: vscode.Position, lineHeight?: number) : [vscode.Range, number] {
        let texMath = this.mathPreview.findInlineMath(document, position)
        let posBegin = position
        let lineNumAsHeight: number
        if (texMath) {
            lineNumAsHeight = 3
        } else {
            lineNumAsHeight = 10
            texMath = this.getTexMath(document, position)
            if (texMath) {
                posBegin = texMath.range.end
            }
        }
        if (lineHeight) {
            lineNumAsHeight = lineHeight
        }
        const posEnd = new vscode.Position(posBegin.line + lineNumAsHeight, 0)
        return [new vscode.Range(posBegin, posEnd), lineNumAsHeight]
    }

    getImgHtml() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline';">
            <meta charset="UTF-8">
            <script>
            const vscode = acquireVsCodeApi();
            window.addEventListener('message', event => {
              const message = event.data; // The JSON data our extension sent
              switch (message.type) {
                case "mathImage":
                  const img = document.getElementById('math');
                  img.onload = () => {
                    if (img.height > window.innerHeight) {
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
                      });
                    } else {
                      img.style.visibility = 'visible';
                    }
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
            <div style="width: 100%;"><img style="visibility: hidden; margin-top: 10px; position: relative; display: block; margin: auto;" src="" id="math" /></div>
        </body>
        </html>`
    }

    async updateMathPreviewInset(document: vscode.TextDocument) {
        const insetInfo = this.previewInsets.get(document)
        if (!insetInfo || !insetInfo.enabled || !insetInfo.context) {
            return
        }
        const context = insetInfo.context
        const inset = context.inset
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const position = editor.selection.active
        const texMath = this.getTexMath(document, position)
        if (!texMath) {
            return
        }
        context.curTexMath = texMath
        const svgDataUrl = await this.mathPreview.generateSVG(document, texMath)
        return inset.webview.postMessage({type: 'mathImage', src: svgDataUrl})
    }

    getTexMath(document: vscode.TextDocument, position: vscode.Position) {
        const texMath = this.mathPreview.findInlineMath(document, position)
        if (texMath) {
            return texMath
        }
        return this.mathPreview.findMathEnvIncludingPosition(document, position)
    }
}
