import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';

/** Compile the client SFC path: Vitest's node environment otherwise imports the SSR render path. */
export function clientComponent(name: string, modules: Record<string, unknown>): vue.Component {
  const filename = new URL(`../../src/components/${name}.vue`, import.meta.url);
  const descriptor = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname }).descriptor;
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports: Record<string, unknown> = {};
  new Function('require', 'exports', js)((id: string) => {
    if (id === 'vue') return vue;
    if (!(id in modules)) throw Error(`Unmapped client component dependency: ${id}`);
    return modules[id];
  }, exports);
  return exports.default as vue.Component;
}
export const componentModule = (component: vue.Component) => ({ __esModule: true, default: component });
export interface HostNode { tag: string; text: string; props: Record<string, unknown>; children: HostNode[]; parent: HostNode | null }
export const hostNode = (tag = 'root'): HostNode => ({ tag, text: '', props: {}, children: [], parent: null });
export const renderer = vue.createRenderer<HostNode, HostNode>({
  createElement: hostNode, createText: text => ({ ...hostNode('text'), text }), createComment: () => hostNode('comment'),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _old, value) => { n.props[key] = value; },
  insert: (n, parent, anchor) => { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); n.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1; if (index < 0) parent.children.push(n); else parent.children.splice(index, 0, n); },
  remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); n.parent = null; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
});
