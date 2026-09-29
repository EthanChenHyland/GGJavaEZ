import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { javaLaunchArgs, launchClasspath, launchRequest, resolveLaunch, validateLaunch, validateJvmArgs } from './launch.mjs'

const directories = []
const project = { status: 'ready', classesDir: '/build/classes', runtimeClasspath: ['/build/classes', '/lib/first.jar', '/lib/second.jar'],
  runnableTargets: ['com.example.Main', 'com.example.tools.Admin$Entry'] }
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

describe('shared Java launch contract', () => {
  it('selects confirmed targets, preserves an explicit target, and rejects a stale explicit target', () => {
    expect(validateLaunch(project)).toEqual({ mainClass: 'com.example.Main', programArgs: [], jvmArgs: [], workingDirectory: '.' })
    expect(validateLaunch(project, { mainClass: '' }).mainClass).toBe('com.example.Main')
    expect(validateLaunch(project, { mainClass: project.runnableTargets[1] }).mainClass).toBe(project.runnableTargets[1])
    expect(validateLaunch({ ...project, runnableTargets: [] }).mainClass).toBeNull()
    expect(() => validateLaunch(project, { mainClass: 'com.other.Main' })).toThrow(/confirmed runnable/)
    expect(() => validateLaunch({ ...project, status: 'failed', diagnostic: 'Dependency resolution failed' })).toThrow(/Dependency resolution/)
  })

  it('requires structured, bounded argument arrays, retaining exact program tokens', () => {
    const programArgs = ['', 'with spaces', '--class-path', '@literal', '$(literal)', 'a\nb']
    const value = validateLaunch(project, { programArgs, jvmArgs: ['-Xmx256m', '-ea', '-Duser.label=with spaces'] })
    expect(value.programArgs).toEqual(programArgs)
    value.programArgs.push('mutation')
    expect(programArgs).toHaveLength(6)
    for (const args of ['one two', null, [3], ['bad\0token'], ['a'.repeat(65537)], Array(1025).fill('')]) {
      expect(() => validateLaunch(project, { programArgs: args })).toThrow(/array/)
      expect(() => validateLaunch(project, { jvmArgs: args })).toThrow(/array/)
    }
  })

  it.each(['-cp', '-classpath', '--class-path=/bad', '-p', '--module-path=/bad', '--patch-module=foo=/bad',
    '-m', '--module=foo/Main', '-jar', 'other.Main', '@args.txt', '--source=26', '-javaagent:/tmp/agent.jar',
    '-agentlib:jdwp=server=y', '-agentpath:/bad', '-Xrunjdwp:server=y', '-Xbootclasspath/a:/bad', '-Xverify:none',
    '-noverify', '-XX:-BytecodeVerificationRemote', '-Dvisualjava.trace=/bad', '-Dvisualjava.debugToken=bad',
    '-Dvisualjava.classes=library.Foreign', '-Dvisualjava.eventLimit=99999999', '-Djava.class.path=/bad',
    '-Djava.system.class.loader=Other', '-Djdk.module.main=other', '-DVisualJava.debugPort=9999'])('refuses user launch override %s', (arg) => {
    expect(() => validateJvmArgs([arg])).toThrow()
  })

  it('supports restrained user JVM options and places required properties after them', () => {
    const launch = launchRequest({ classesDir: '/build/classes', projectRoot: '/project', mainClass: 'com.example.Main',
      classpath: ['/build/classes', '/lib/first.jar', '/lib/second.jar'], jvmArgs: ['-Xmx128m', '-Duser.value=1', '-XX:+UseG1GC'],
      programArgs: ['with spaces', '', '-cp'] })
    expect(javaLaunchArgs(launch, ['-Xverify:all', '-Dvisualjava.trace=/owned/trace'])).toEqual([
      '-Xmx128m', '-Duser.value=1', '-XX:+UseG1GC', '-Xverify:all', '-Dvisualjava.trace=/owned/trace',
      '-cp', ['/build/classes', '/lib/first.jar', '/lib/second.jar'].join(delimiter), 'com.example.Main', 'with spaces', '', '-cp',
    ])
    expect(launchRequest({ classesDir: '/build/classes', mainClass: 'Main' }).workingDirectory).toBe('/build/classes')
    expect(() => launchRequest({ classesDir: '/build/classes', projectRoot: '/project', mainClass: 'Main', workingDirectory: '/project-other' })).toThrow(/escapes/)
  })

  it('keeps staged output first with dependency order and fails malformed classpaths', () => {
    expect(launchClasspath('/build/classes', ['/lib/second.jar', '/build/classes', '/lib/first.jar'])).toEqual(['/build/classes', '/lib/second.jar', '/lib/first.jar'])
    expect(launchClasspath('/build/classes')).toEqual(['/build/classes'])
    for (const cp of ['/lib/one.jar', ['relative'], [''], [`/lib/one${delimiter}/lib/two`], ['/lib/*']]) {
      expect(() => launchClasspath('/build/classes', cp)).toThrow()
    }
    expect(() => validateLaunch(project, { classpath: ['/bad'] })).toThrow(/server-owned/)
  })

  it('resolves existing relative cwd and rejects traversal, missing paths, files and contained/outside symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'java-launch-test-')); directories.push(root)
    await mkdir(join(root, 'data', 'nested'), { recursive: true })
    await writeFile(join(root, 'file'), '')
    await symlink(join(root, 'data'), join(root, 'link'))
    await symlink(tmpdir(), join(root, 'outside'))
    const model = { ...project, projectRoot: root }
    const resolved = await resolveLaunch(model, { workingDirectory: 'data/nested', programArgs: ['value'] })
    expect(resolved.workingDirectory).toBe(join(root, 'data', 'nested'))
    expect(resolved.classpath).toEqual(project.runtimeClasspath)
    expect((await resolveLaunch(model)).workingDirectory).toBe(root)
    for (const cwd of ['../escape', 'data/../data', '/absolute', 'C:\\absolute', 'C:relative', 'data\\nested', 'missing', 'file', 'link', 'link/nested', 'outside']) {
      await expect(resolveLaunch(model, { workingDirectory: cwd })).rejects.toThrow()
    }
    await expect(resolveLaunch({ ...model, projectRoot: join(root, 'link') })).rejects.toThrow(/symbolic/)
  })
})
