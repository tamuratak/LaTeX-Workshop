import type * as vscode from 'vscode'
import * as path from 'path'
import * as workerpool from 'workerpool'
import type {Proxy} from 'workerpool'
import type {IPdfRendererWorker} from './pdfrenderer_worker'

export class PDFRenderer {
    private readonly pool: workerpool.WorkerPool
    private readonly proxy: workerpool.Promise<Proxy<IPdfRendererWorker>>

    constructor() {
        this.pool = workerpool.pool(
            path.join(__dirname, 'pdfrenderer_worker.js'),
            { maxWorkers: 1, workerType: 'process' }
        )
        this.proxy = this.pool.proxy<IPdfRendererWorker>()
    }

    async renderToSVG(
        pdfPath: string,
        options: { height: number, width: number, pageNumber: number },
        ctoken: vscode.CancellationToken
    ): Promise<string> {
        const proxy = await this.proxy
        const promise = proxy.renderToSvg(pdfPath, options).timeout(3000)
        ctoken.onCancellationRequested(() => promise.cancel())
        return promise
    }

    async getNumPages(pdfPath: string): Promise<number> {
        return (await this.proxy).getNumPages(pdfPath).timeout(3000)
    }

}
