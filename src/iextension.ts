import {Commander} from './commander'
import {Logger} from './components/logger'
import {BuildInfo} from './components/buildinfo'
import {Manager} from './components/manager'
import {Builder} from './components/builder'
import {Viewer} from './components/viewer'
import {Server} from './components/server'
import {Locator} from './components/locator'
import {Linter} from './components/linter'
import {Cleaner} from './components/cleaner'
import {Counter} from './components/counter'
import {TeXMagician} from './components/texmagician'
import {EnvPair} from './components/envpair'
import {Parser as LogParser} from './components/parser/log'
import {UtensilsParser as PEGParser} from './components/parser/syntax'

import {Completer} from './providers/completion'
import {CodeActions} from './providers/codeactions'
import {GraphicsPreview} from './providers/preview/graphicspreview'
import {MathPreview} from './providers/preview/mathpreview'
import {SectionNodeProvider, StructureTreeView} from './providers/structure'
import { SnippetPanel } from './components/snippetpanel'
import { BibtexFormater } from './components/bibtexformater'


export interface IExtensionBase {
    extensionRoot: string,
    logger: Logger,
    manager: {
        rootDir?: string,
        rootFile?: string
    }
}

export interface IExtension {
    packageInfo: { version?: string },
    extensionRoot: string,
    logger: Logger,
    buildInfo: BuildInfo,
    commander: Commander,
    manager: Manager,
    builder: Builder,
    viewer: Viewer,
    server: Server,
    locator: Locator,
    logParser: LogParser,
    pegParser: PEGParser,
    completer: Completer,
    linter: Linter,
    cleaner: Cleaner,
    counter: Counter,
    codeActions: CodeActions,
    texMagician: TeXMagician,
    envPair: EnvPair,
    structureProvider: SectionNodeProvider,
    structureViewer: StructureTreeView,
    snippetPanel: SnippetPanel,
    graphicsPreview: GraphicsPreview,
    mathPreview: MathPreview,
    bibtexFormater: BibtexFormater
}
