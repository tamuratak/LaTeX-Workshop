import * as cp from 'child_process'
import {EventEmitter} from 'events'
import * as path from 'path'
import * as chokidar from 'chokidar'

export class Watcher extends EventEmitter {
  private child: cp.ChildProcess | undefined
  closing: boolean = false
  closed: boolean = false

  constructor(filePath: string | ReadonlyArray<string>, opts: chokidar.WatchOptions) {
    super()
    const child = cp.fork(path.join(__dirname, 'child'))
    this.child = child
    
    child.send({
      path: filePath,
      opts
    })
    
    child.on('message', (msg) => {
      this.emit(msg.event, msg.path)
      this.emit('all', msg.event, msg.path)
    })
    
    child.on('error', () => {})
    
    child.on('exit', (exit, signal) => {
      if (this.closing) {
        this.closing = false
        this.closed = true
        return
      }      
      this.emit('childDead', child.pid, exit, signal)
    })
  }

  close(cb: () => {}) {
    if (this.child) {
      this.closing = true
      if (cb) {
        this.child.on('exit', cb)
      }
      setImmediate(() => {
        this.child && this.child.kill()
      })
    } else if (cb) {
      setImmediate(cb)
    }
  }
}
