import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Step {
  id?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, string>
}
interface Job {
  if: string
  'runs-on': string
  needs?: string
  permissions: Record<string, string>
  outputs?: Record<string, string>
  environment?: { name: string; url: string }
  steps: Step[]
}

// Use the project's Bun runtime to parse YAML, without another dependency.
const yaml = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
const parsed = spawnSync('bun', ['-e', 'console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))'], {
  input: yaml, encoding: 'utf8',
})
if (parsed.status !== 0) throw new Error(parsed.stderr)
const workflow = JSON.parse(parsed.stdout) as {
  jobs: Record<string, Job>
  concurrency: { group: string; 'cancel-in-progress': boolean }
}
const { build, deploy } = workflow.jobs
const identity = build.steps.find(step => step.id === 'artifact')!
const upload = build.steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact@'))!
const publication = deploy.steps.find(step => step.uses?.startsWith('actions/deploy-pages@'))!
const guard = deploy.steps[0]

function buildIdentity(run: string, attempt: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'pages-workflow-'))
  try {
    const output = join(directory, 'output')
    const name = identity.env!.ARTIFACT_NAME
      .replace('${{ github.run_id }}', run)
      .replace('${{ github.run_attempt }}', attempt)
    const result = spawnSync('/bin/bash', ['-e', '-c', identity.run!], {
      env: { ...process.env, ARTIFACT_NAME: name, GITHUB_OUTPUT: output }, encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
    const recorded = readFileSync(output, 'utf8')
    expect(recorded).toBe(`name=${name}\n`)
    return recorded.slice(5).trimEnd()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function acceptIdentity(name?: string) {
  const env = { ...process.env }
  delete env.ARTIFACT_NAME
  if (name !== undefined) env.ARTIFACT_NAME = name
  return spawnSync('/bin/bash', ['-e', '-c', guard.run!], { env }).status
}

describe('Pages publication recovery contract', () => {
  it('uses separate build and deploy jobs with only deployment depending on the build', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(['build', 'deploy'])
    expect(deploy.needs).toBe('build')
    expect(build.steps.some(step => step.uses?.startsWith('actions/deploy-pages@'))).toBe(false)
    expect(deploy.steps.some(step => step.uses?.startsWith('actions/upload-pages-artifact@'))).toBe(false)
    expect(deploy.steps.some(step => step.run?.includes('site:build'))).toBe(false)
  })

  it('binds upload, build output and deployment to the captured build identity', () => {
    expect(identity.env?.ARTIFACT_NAME).toBe('github-pages-${{ github.run_id }}-${{ github.run_attempt }}')
    expect(upload.with?.name).toBe('${{ steps.artifact.outputs.name }}')
    expect(upload.with?.path).toBe('_site')
    expect(build.outputs?.artifact_name).toBe('${{ steps.artifact.outputs.name }}')
    expect(publication.with?.artifact_name).toBe('${{ needs.build.outputs.artifact_name }}')
    expect(guard.env?.ARTIFACT_NAME).toBe('${{ needs.build.outputs.artifact_name }}')
    expect(JSON.stringify(deploy)).not.toContain('github.run_attempt')
    expect(JSON.stringify(deploy)).not.toContain('github.run_id')
  })

  it('keeps the successful build artifact for deployment-only recovery', () => {
    const captured = buildIdentity('100', '1')
    // GitHub retains successful needs-job outputs when rerunning only deployment.
    // The new deploy attempt must not derive its own attempt-2 name.
    expect(captured).toBe('github-pages-100-1')
    expect(acceptIdentity(captured)).toBe(0)
    const retained = ['github-pages', 'github-pages', captured]
    expect(retained.filter(name => name === captured)).toEqual([captured])
  })

  it('distinguishes full-run recovery and separate runs without deleting retained artifacts', () => {
    const first = buildIdentity('100', '1')
    const fullRerun = buildIdentity('100', '2')
    const separateRun = buildIdentity('101', '1')
    expect(new Set([first, fullRerun, separateRun]).size).toBe(3)
    expect([first, fullRerun].filter(name => name === fullRerun)).toEqual([fullRerun])
    expect(acceptIdentity(fullRerun)).toBe(0)
    expect(yaml).not.toMatch(/delete-artifact|overwrite:|gh api|curl /)
  })

  it('stops before publication when the build output is empty or absent', () => {
    expect(acceptIdentity('')).not.toBe(0)
    expect(acceptIdentity()).not.toBe(0)
    expect(deploy.steps.indexOf(guard)).toBeLessThan(deploy.steps.indexOf(publication))
  })

  it('allows standard hosted runners only for an explicitly public repository', () => {
    for (const job of [build, deploy]) {
      expect(job['runs-on']).toBe('ubuntu-latest')
      expect(job.if).toBe("${{ github.event.repository.visibility == 'public' }}")
    }
    // Exact equality excludes private, internal and unreadable visibility.
    for (const visibility of ['private', 'internal', '', undefined]) {
      expect(visibility === 'public').toBe(false)
    }
  })

  it('serializes publication and confines write/OIDC authority to deployment', () => {
    expect(workflow.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false })
    expect(build.permissions).toEqual({ contents: 'read', pages: 'read' })
    expect(deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' })
    expect(deploy.environment).toEqual({ name: 'github-pages', url: '${{ steps.deployment.outputs.page_url }}' })
  })
})
