import fs from 'node:fs'
import path from 'node:path'
import { agentRoot, getConfig } from '../config/env.mjs'
import { buildRuleBasedQueries, parseQueryPlan } from '../knowledge/retrievalPlanner.mjs'

function readSystemPrompt() {
  const promptPath = path.join(agentRoot, 'prompts/xiqu-qa-system.md')
  if (!fs.existsSync(promptPath)) return '你是 xiqu 项目的戏曲问答智能体，请基于给定资料用中文回答。'
  return fs.readFileSync(promptPath, 'utf8')
}

function requireModelConfig() {
  const config = getConfig()
  const baseUrl = process.env.NVIDIA_BASE_URL
  const apiKey = process.env.NVIDIA_API_KEY
  const model = process.env.NVIDIA_TEXT_MODEL || process.env.NVIDIA_MODEL

  if (!baseUrl || !apiKey || !model) {
    throw new Error('缺少模型配置：需要 NVIDIA_BASE_URL、NVIDIA_API_KEY、NVIDIA_MODEL')
  }

  return { ...config, baseUrl, apiKey, model }
}

async function chatCompletion(messages, options = {}) {
  const config = requireModelConfig()
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(config.llmTimeoutMs),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? Number(process.env.NVIDIA_TEMPERATURE || 0.2),
      top_p: options.topP ?? Number(process.env.NVIDIA_TOP_P || 0.7),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`模型调用失败 ${response.status}: ${errorText.slice(0, 500)}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('模型响应为空')
  return content.replace(/^Filed to:.*\n+/i, '').trim()
}

function buildContextBlock(sources) {
  return sources
    .map((source, index) => {
      const sourceId = source.path || source.title || `source-${index + 1}`
      const content = source.content || source.snippet || ''
      return `【资料${index + 1}：${sourceId}】\n${content}`
    })
    .join('\n\n')
}

function buildHistoryBlock(history = []) {
  return history
    .slice(-8)
    .map((item) => `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`)
    .join('\n')
}

export async function planRetrievalQueries(question) {
  const config = getConfig()
  if (!config.useLlm) {
    return { queries: buildRuleBasedQueries(question), plannerMode: 'rule-plan-llm-disabled', error: '' }
  }

  try {
    const content = await chatCompletion([
      {
        role: 'system',
        content: '你是戏曲知识库检索规划器。请把用户自然问题转换成适合 BM25/sage-wiki search 的中文检索 query。只输出 JSON：{"queries":["..."]}，不要解释。',
      },
      {
        role: 'user',
        content: `用户问题：${question}\n\n要求：生成 2-5 个检索 query；尽量保留核心实体；适当加入“概述、区别、特点、唱腔、表演、历史、代表剧目”等检索词；不要生成完整回答。`,
      },
    ], { temperature: 0.1 })
    return { queries: parseQueryPlan(content, question), plannerMode: 'llm-plan', error: '' }
  } catch (error) {
    return {
      queries: buildRuleBasedQueries(question),
      plannerMode: 'rule-fallback-plan',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function replanRetrievalQueries({ question, previousRounds }) {
  const config = getConfig()
  if (!config.useLlm) {
    const previousQueries = new Set(previousRounds.flatMap((round) => round.queries || []))
    const queries = buildRuleBasedQueries(question).filter((query) => !previousQueries.has(query))
    return { queries: queries.length ? queries : buildRuleBasedQueries(question), plannerMode: 'rule-replan-llm-disabled', error: '' }
  }

  try {
    const content = await chatCompletion([
      {
        role: 'system',
        content: '你是戏曲知识库检索重规划器。前一轮 BM25 检索效果不好，请换一组更宽或更具体的中文关键词。只输出 JSON：{"queries":["..."]}。',
      },
      {
        role: 'user',
        content: `用户问题：${question}\n\n上一轮检索情况：\n${JSON.stringify(previousRounds, null, 2)}\n\n请重新生成 2-5 个 query。避免完全重复上一轮 query；可以拆分实体分别检索，例如“京剧 概述”“昆曲 概述”。`,
      },
    ], { temperature: 0.2 })
    return { queries: parseQueryPlan(content, question), plannerMode: 'llm-replan', error: '' }
  } catch (error) {
    return {
      queries: buildRuleBasedQueries(question),
      plannerMode: 'rule-fallback-replan',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function synthesizeAnswer({ question, sources, history = [] }) {
  const context = buildContextBlock(sources.slice(0, 5))
  const historyBlock = buildHistoryBlock(history)
  return chatCompletion([
    {
      role: 'system',
      content: `${readSystemPrompt()}\n\n你现在是 agent 层，不要透传工具内部日志，不要输出 Filed to/文件写入路径。只基于给定资料综合回答；如果资料不足，请明确说明。`,
    },
    {
      role: 'user',
      content: `${historyBlock ? `最近对话历史：\n${historyBlock}\n\n` : ''}用户当前问题：${question}\n\n检索到的知识库资料：\n${context}\n\n请结合最近对话历史理解指代关系，但事实依据优先来自知识库资料。请综合作答，并在关键事实后用【资料1】这类形式标注来源。`,
    },
  ])
}

export async function answerWithoutSources(question, history = []) {
  const historyBlock = buildHistoryBlock(history)
  return chatCompletion([
    {
      role: 'system',
      content: `${readSystemPrompt()}\n\n当前知识库没有命中资料。你可以用模型通用知识回答，但必须在开头明确说明“当前知识库未命中相关资料，以下回答基于模型通用知识，仅供参考”。不要编造来源。`,
    },
    {
      role: 'user',
      content: `${historyBlock ? `最近对话历史：\n${historyBlock}\n\n` : ''}用户当前问题：${question}`,
    },
  ])
}
