<script setup lang="ts">
import { computed, ref } from 'vue'
import graphData from '../data/wikiGraph.json'

type WikiNode = {
  id: string
  label: string
  title: string
  aliases: string[]
  path: string
  degree: number
}

type WikiEdge = {
  source: string
  target: string
}

const graph = graphData as {
  source: string
  nodes: WikiNode[]
  edges: WikiEdge[]
}

const query = ref('')
const selectedId = ref(graph.nodes[0]?.id ?? '')

const selectedNode = computed(() => graph.nodes.find((node) => node.id === selectedId.value) ?? graph.nodes[0])

const filteredNodes = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const nodes = keyword
    ? graph.nodes.filter((node) =>
        [node.label, node.title, node.id, ...node.aliases].some((text) => text.toLowerCase().includes(keyword)),
      )
    : graph.nodes

  return nodes.slice(0, 96)
})

const visibleNodeIds = computed(() => new Set(filteredNodes.value.map((node) => node.id)))

const visibleEdges = computed(() =>
  graph.edges.filter((edge) => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)),
)

const neighborIds = computed(() => {
  const ids = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.source === selectedId.value) {
      ids.add(edge.target)
    }
    if (edge.target === selectedId.value) {
      ids.add(edge.source)
    }
  }
  return ids
})

const nodeById = computed(() => new Map(graph.nodes.map((node) => [node.id, node])))

const selectedNeighbors = computed(() =>
  [...neighborIds.value]
    .map((id) => nodeById.value.get(id))
    .filter((node): node is WikiNode => Boolean(node))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, 'zh-Hans-CN'))
    .slice(0, 18),
)

const positions = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const nodes = filteredNodes.value
  const centerX = 360
  const centerY = 310
  const maxDegree = Math.max(...nodes.map((node) => node.degree), 1)

  nodes.forEach((node, index) => {
    const ring = index < 18 ? 1 : index < 52 ? 2 : 3
    const ringStart = ring === 1 ? 0 : ring === 2 ? 18 : 52
    const ringCount = ring === 1 ? Math.min(nodes.length, 18) : ring === 2 ? Math.min(Math.max(nodes.length - 18, 1), 34) : Math.max(nodes.length - 52, 1)
    const angle = ((index - ringStart) / ringCount) * Math.PI * 2 - Math.PI / 2
    const radius = ring === 1 ? 112 : ring === 2 ? 205 : 278
    const degreePull = (node.degree / maxDegree) * 34

    map.set(node.id, {
      x: centerX + Math.cos(angle) * (radius - degreePull),
      y: centerY + Math.sin(angle) * (radius - degreePull),
    })
  })

  return map
})

function nodePosition(id: string) {
  return positions.value.get(id) ?? { x: 360, y: 310 }
}

function selectNode(id: string) {
  selectedId.value = id
}
</script>

<template>
  <main class="xiqu-page wiki-graph-page">
    <section class="wiki-graph-shell">
      <header class="wiki-graph-header">
        <RouterLink class="wiki-graph-back" :to="{ name: 'home' }">返回</RouterLink>
        <p>XIQU KNOWLEDGE GRAPH</p>
        <h1>戏曲知识图谱</h1>
        <span>基于 {{ graph.source }} 的 wikilink 自动生成</span>
      </header>

      <label class="wiki-graph-search">
        <span>搜索概念</span>
        <input v-model="query" type="search" placeholder="如：京剧、脸谱、水袖、穆桂英" />
      </label>

      <section class="wiki-graph-canvas" aria-label="知识图谱">
        <svg viewBox="0 0 720 620" role="img" aria-label="戏曲知识概念关系图">
          <defs>
            <radialGradient id="wiki-node-fill" cx="35%" cy="28%" r="70%">
              <stop offset="0%" stop-color="#fff8df" />
              <stop offset="58%" stop-color="#f5c76f" />
              <stop offset="100%" stop-color="#c84b50" />
            </radialGradient>
          </defs>

          <line
            v-for="edge in visibleEdges"
            :key="`${edge.source}-${edge.target}`"
            class="wiki-graph-edge"
            :class="{ 'is-related': edge.source === selectedId || edge.target === selectedId }"
            :x1="nodePosition(edge.source).x"
            :y1="nodePosition(edge.source).y"
            :x2="nodePosition(edge.target).x"
            :y2="nodePosition(edge.target).y"
          />

          <g
            v-for="node in filteredNodes"
            :key="node.id"
            class="wiki-graph-node"
            :class="{ 'is-selected': node.id === selectedId, 'is-neighbor': neighborIds.has(node.id) }"
            :transform="`translate(${nodePosition(node.id).x}, ${nodePosition(node.id).y})`"
            role="button"
            tabindex="0"
            @click="selectNode(node.id)"
            @keydown.enter="selectNode(node.id)"
            @keydown.space.prevent="selectNode(node.id)"
          >
            <circle :r="Math.min(20, 7 + node.degree * 0.42)" />
            <text y="32">{{ node.label }}</text>
          </g>
        </svg>
      </section>

      <aside v-if="selectedNode" class="wiki-graph-detail">
        <div>
          <p class="wiki-graph-detail__eyebrow">当前概念</p>
          <h2>{{ selectedNode.label }}</h2>
          <p>{{ selectedNode.title }}</p>
          <span>{{ selectedNode.path }}</span>
        </div>

        <div class="wiki-graph-stats">
          <strong>{{ graph.nodes.length }}</strong>
          <span>概念</span>
          <strong>{{ graph.edges.length }}</strong>
          <span>关系</span>
          <strong>{{ selectedNode.degree }}</strong>
          <span>连接</span>
        </div>

        <section class="wiki-graph-neighbors">
          <h3>相关概念</h3>
          <button v-for="node in selectedNeighbors" :key="node.id" type="button" @click="selectNode(node.id)">
            {{ node.label }}
          </button>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.wiki-graph-page {
  padding: 0 0 6rem;
  color: #174f4b;
}

.wiki-graph-shell {
  max-width: 30rem;
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: 1.15rem 1rem 1.5rem;
  background:
    linear-gradient(180deg, rgb(255 248 221 / 0.82), rgb(242 234 209 / 0.72)),
    var(--xiqu-app-bg-image) center top / 30rem auto repeat;
}

.wiki-graph-header {
  position: relative;
  padding: 1.05rem 1rem 1rem;
  color: #fff8df;
  border-radius: 1.35rem;
  background:
    radial-gradient(circle at 85% 12%, rgb(71 166 159 / 0.95), transparent 9rem),
    linear-gradient(135deg, #b12831, #7d1c23 54%, #1f706c);
  box-shadow: 0 0.6rem 1.5rem rgb(92 44 32 / 0.16);
}

.wiki-graph-back {
  position: absolute;
  top: 0.86rem;
  right: 0.9rem;
  color: rgb(255 248 223 / 0.88);
  font-size: 0.78rem;
  text-decoration: none;
}

.wiki-graph-header p,
.wiki-graph-detail__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.24em;
  opacity: 0.82;
}

.wiki-graph-header h1 {
  margin: 0.4rem 0 0.45rem;
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "Songti SC", serif;
  font-size: clamp(2rem, 10vw, 3rem);
  line-height: 1;
  letter-spacing: 0.16em;
}

.wiki-graph-header span {
  font-size: 0.78rem;
  opacity: 0.86;
}

.wiki-graph-search {
  display: block;
  margin-top: 0.85rem;
  padding: 0.85rem;
  border-radius: 1.15rem;
  background: rgb(255 255 255 / 0.74);
  box-shadow: 0 0.28rem 0.8rem rgb(79 55 37 / 0.08);
}

.wiki-graph-search span {
  display: block;
  margin-bottom: 0.45rem;
  color: #8c2a30;
  font-size: 0.78rem;
  font-weight: 800;
}

.wiki-graph-search input {
  width: 100%;
  padding: 0.72rem 0.9rem;
  color: #174f4b;
  border: 1px solid rgb(151 90 48 / 0.18);
  border-radius: 999px;
  outline: none;
  background: #fffaf0;
}

.wiki-graph-canvas {
  margin-top: 0.85rem;
  overflow: hidden;
  border: 1px solid rgb(151 90 48 / 0.16);
  border-radius: 1.35rem;
  background:
    radial-gradient(circle at 50% 45%, rgb(255 248 223 / 0.98), rgb(234 213 174 / 0.52)),
    #f7edcf;
  box-shadow: inset 0 0 2rem rgb(123 55 39 / 0.08);
}

.wiki-graph-canvas svg {
  display: block;
  width: 100%;
  min-height: 25rem;
}

.wiki-graph-edge {
  stroke: rgb(31 112 108 / 0.2);
  stroke-width: 1.2;
}

.wiki-graph-edge.is-related {
  stroke: rgb(190 58 65 / 0.75);
  stroke-width: 2.2;
}

.wiki-graph-node {
  cursor: pointer;
  outline: none;
}

.wiki-graph-node circle {
  fill: url("#wiki-node-fill");
  stroke: rgb(255 248 223 / 0.92);
  stroke-width: 2;
  filter: drop-shadow(0 0.18rem 0.2rem rgb(79 55 37 / 0.2));
}

.wiki-graph-node text {
  fill: #174f4b;
  font-size: 11px;
  font-weight: 800;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgb(255 248 223 / 0.86);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.wiki-graph-node.is-neighbor circle {
  stroke: #2f9c94;
  stroke-width: 3;
}

.wiki-graph-node.is-selected circle {
  fill: #2f9c94;
  stroke: #fff8df;
  stroke-width: 4;
}

.wiki-graph-node.is-selected text {
  fill: #8c2a30;
  font-size: 13px;
}

.wiki-graph-detail {
  margin-top: 0.9rem;
  padding: 1rem;
  border-radius: 1.25rem;
  background: rgb(255 255 255 / 0.8);
  box-shadow: 0 0.35rem 1rem rgb(79 55 37 / 0.08);
}

.wiki-graph-detail h2 {
  margin: 0.3rem 0 0.15rem;
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "Songti SC", serif;
  font-size: 1.85rem;
  line-height: 1.1;
  letter-spacing: 0.1em;
}

.wiki-graph-detail p {
  margin: 0.2rem 0;
  color: #2f706c;
  font-weight: 700;
}

.wiki-graph-detail span {
  color: #8f705b;
  font-size: 0.76rem;
}

.wiki-graph-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.2rem 0.45rem;
  margin-top: 0.9rem;
  padding: 0.75rem;
  text-align: center;
  border-radius: 1rem;
  background: #fff8df;
}

.wiki-graph-stats strong {
  color: #a02b32;
  font-size: 1.35rem;
}

.wiki-graph-stats span {
  color: #407976;
  font-size: 0.74rem;
}

.wiki-graph-neighbors {
  margin-top: 0.9rem;
}

.wiki-graph-neighbors h3 {
  margin: 0 0 0.55rem;
  font-size: 0.9rem;
}

.wiki-graph-neighbors button {
  margin: 0 0.38rem 0.45rem 0;
  padding: 0.45rem 0.7rem;
  color: #8c2a30;
  border: 1px solid rgb(160 43 50 / 0.18);
  border-radius: 999px;
  background: #fff8df;
}
</style>
