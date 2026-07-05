import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(webRoot, '..')
const conceptsDir = path.resolve(repoRoot, 'wiki/xiqu-knowledge/wiki/concepts')
const outputPath = path.resolve(webRoot, 'src/data/wikiGraph.json')

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return {}
  }

  const endIndex = raw.indexOf('\n---', 3)
  if (endIndex === -1) {
    return {}
  }

  const frontmatter = raw.slice(3, endIndex)
  const concept = frontmatter.match(/^concept:\s*(.+)$/m)?.[1]?.trim()
  const aliasesRaw = frontmatter.match(/^aliases:\s*\[(.*)\]\s*$/m)?.[1] ?? ''
  const aliases = [...aliasesRaw.matchAll(/"([^"]+)"/g)].map((match) => match[1])

  return { concept, aliases }
}

function normalizeName(value) {
  return value
    .trim()
    .replace(/\.md$/i, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
}

function chooseLabel(slug, concept, aliases) {
  const chineseAlias = aliases.find((alias) => /[\u4e00-\u9fa5]/.test(alias))
  return chineseAlias ?? concept ?? titleFromSlug(slug)
}

const files = (await readdir(conceptsDir)).filter((file) => file.endsWith('.md')).sort()
const nodes = []
const aliasToSlug = new Map()
const rawBySlug = new Map()

for (const file of files) {
  const slug = file.replace(/\.md$/i, '')
  const raw = await readFile(path.join(conceptsDir, file), 'utf8')
  const { concept, aliases = [] } = parseFrontmatter(raw)
  const label = chooseLabel(slug, concept, aliases)
  const node = {
    id: slug,
    label,
    title: concept ?? titleFromSlug(slug),
    aliases: aliases.slice(0, 8),
    path: `wiki/concepts/${file}`,
    degree: 0,
  }

  nodes.push(node)
  rawBySlug.set(slug, raw)
  aliasToSlug.set(normalizeName(slug), slug)
  aliasToSlug.set(normalizeName(node.title), slug)
  aliasToSlug.set(normalizeName(node.label), slug)
  for (const alias of aliases) {
    aliasToSlug.set(normalizeName(alias), slug)
  }
}

const nodeIds = new Set(nodes.map((node) => node.id))
const edgeMap = new Map()

for (const [source, raw] of rawBySlug.entries()) {
  const links = [...raw.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map((match) => normalizeName(match[1]))
    .map((name) => aliasToSlug.get(name) ?? name)
    .filter((target) => target !== source && nodeIds.has(target))

  for (const target of new Set(links)) {
    const [a, b] = [source, target].sort()
    edgeMap.set(`${a}--${b}`, { source: a, target: b })
  }
}

const degreeById = new Map(nodes.map((node) => [node.id, 0]))
for (const edge of edgeMap.values()) {
  degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1)
  degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1)
}

for (const node of nodes) {
  node.degree = degreeById.get(node.id) ?? 0
}

nodes.sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, 'zh-Hans-CN'))

const graph = {
  source: 'wiki/xiqu-knowledge/wiki/concepts',
  nodes,
  edges: [...edgeMap.values()].sort((a, b) => `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`)),
}

await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`)
console.log(`Generated ${path.relative(repoRoot, outputPath)}: ${nodes.length} nodes, ${graph.edges.length} edges`)
