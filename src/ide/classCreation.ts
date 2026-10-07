import { assertWorkspacePath, pathIsWithin } from './pathChanges'
import type { JavaProject } from './javaProject'

const reserved = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _').split(' '))
const identifier = (name: string) => /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(name) && !reserved.has(name)
const classIdentifier = (name: string) => identifier(name) && !['var', 'yield', 'record', 'sealed', 'permits'].includes(name)
export function defaultClassFolder(project: JavaProject | null): string {
  return project?.sourceRoots[0] ?? '.'
}
export function javaClassPath(folder: string, name: string): string {
  const simple = name.trim().replace(/\.java$/, '')
  if (!classIdentifier(simple)) throw new Error('Enter a valid Java class name, such as Account.')
  const path = folder && folder !== '.' ? `${folder}/${simple}.java` : `${simple}.java`
  assertWorkspacePath(path)
  return path
}
/** Source roots include test roots; longest match prevents a parent root becoming a package. */
export function javaClassContent(path: string, project: JavaProject | null): string {
  assertWorkspacePath(path)
  const name = path.split('/').at(-1)!.replace(/\.java$/, '')
  if (!path.endsWith('.java') || !classIdentifier(name)) throw new Error('A Java class needs a valid name ending in .java')
  const roots = project ? [...project.sourceRoots, ...project.testSourceRoots] : ['src/main/java', 'src/test/java', 'src', '.']
  const root = roots.filter((candidate) => candidate === '.' || pathIsWithin(path, candidate)).sort((a, b) => b.length - a.length)[0]
  if (!root) throw new Error('Choose a Java source folder from the project for this class.')
  const relative = root === '.' ? path : path.slice(root.length + 1)
  const parts = relative.split('/').slice(0, -1)
  if (parts.some((part) => !identifier(part))) throw new Error('The selected folder does not form a valid Java package.')
  return `${parts.length ? `package ${parts.join('.')};\n\n` : ''}public class ${name} {\n}\n`
}
