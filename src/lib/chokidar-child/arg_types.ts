import * as chokidar from 'chokidar'

export type Arg = {
  method: 'init',
  args: {
      path: string | ReadonlyArray<string>,
      opts: chokidar.WatchOptions
  }
} | {
    method: 'add',
    args: {
        path: string | ReadonlyArray<string>
    }
} | {
    method: 'unwatch',
    args: {
        path: string | ReadonlyArray<string>
    }
}
