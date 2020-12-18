import type * as vscode from 'vscode'
import * as path from 'path'
import * as workerpool from 'workerpool'
import type {Proxy} from 'workerpool'
import type {IGraphicsScalerWorker} from './graphicsscaler_worker'

export class GraphicsScaler {
    private readonly pool: workerpool.WorkerPool
    private readonly proxy: workerpool.Promise<Proxy<IGraphicsScalerWorker>>

    constructor() {
        this.pool = workerpool.pool(
            path.join(__dirname, 'graphicsscaler_worker.js'),
            { maxWorkers: 1, workerType: 'process' }
        )
        this.proxy = this.pool.proxy<IGraphicsScalerWorker>()
    }

    async scale(
        filePath: string,
        options: { height: number, width: number },
        ctoken: vscode.CancellationToken
    ): Promise<string> {
        const proxy = await this.proxy
        const promise = proxy.scale(filePath, options).timeout(3000)
        ctoken.onCancellationRequested(() => promise.cancel())
        return promise
    }
}
