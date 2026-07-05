import { getConfig } from '../config/env.mjs'
import { answerWithoutSources, planRetrievalQueries, replanRetrievalQueries, synthesizeAnswer } from './llmClient.mjs'
import { searchKnowledge } from '../knowledge/sageWikiCli.mjs'

function dedupeResults(results) {
  const seen = new Set()
  const deduped = []
  for (const item of results) {
    const key = item.path || `${item.title}|${item.snippet}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function rankResults(results, queries) {
  const terms = queries.flatMap((query) => String(query || '').split(/\s+/)).filter(Boolean)
  return [...results].sort((a, b) => {
    const scoreFor = (item) => {
      const title = item.title || ''
      const text = `${item.title || ''} ${item.snippet || ''} ${item.content || ''} ${item.tags?.join(' ') || ''}`
      const termScore = terms.reduce((score, term) => {
        if (title === term) return score + 12
        if (title.includes(term)) return score + 6
        if (text.includes(term)) return score + 2
        return score
      }, 0)
      const tagText = item.tags?.join(' ') || ''
      const contentScore = item.content ? 8 : 0
      const structuredScore = /article|concept/.test(tagText) ? 3 : 0
      const imagePenalty = title.startsWith('[Image:') || /image/.test(tagText) ? -20 : 0
      return termScore + contentScore + structuredScore + imagePenalty + Number(item.score || 0)
    }
    return scoreFor(b) - scoreFor(a)
  })
}

async function executeSearchRound({ round, queries, plannerMode, plannerError }) {
  const searches = []
  const allResults = []

  for (const query of queries) {
    const search = await searchKnowledge(query)
    searches.push({
      query,
      ok: search.ok,
      resultCount: search.results.length,
      error: search.ok ? '' : search.error,
    })
    allResults.push(...search.results)
  }

  const rankedResults = rankResults(dedupeResults(allResults), queries)
  return {
    round,
    plannerMode,
    plannerError,
    queries,
    searches,
    resultCount: rankedResults.length,
    results: rankedResults,
  }
}

async function retrieveKnowledge(question) {
  const rounds = []
  const firstPlan = await planRetrievalQueries(question)
  const firstRound = await executeSearchRound({
    round: 1,
    queries: firstPlan.queries,
    plannerMode: firstPlan.plannerMode,
    plannerError: firstPlan.error,
  })
  rounds.push(firstRound)

  if (firstRound.resultCount > 0) {
    return { rounds, rankedResults: firstRound.results, knowledgeHit: true }
  }

  const secondPlan = await replanRetrievalQueries({ question, previousRounds: toMetaRounds(rounds) })
  const previousQueries = new Set(firstPlan.queries)
  const secondQueries = secondPlan.queries.filter((query) => !previousQueries.has(query))
  const secondRound = await executeSearchRound({
    round: 2,
    queries: secondQueries.length ? secondQueries : secondPlan.queries,
    plannerMode: secondPlan.plannerMode,
    plannerError: secondPlan.error,
  })
  rounds.push(secondRound)

  return { rounds, rankedResults: secondRound.results, knowledgeHit: secondRound.resultCount > 0 }
}

function buildFallbackAnswer(question, results, knowledgeHit) {
  if (!knowledgeHit || !results.length) {
    return `当前知识库未命中和“${question}”直接相关的资料。由于 AGENT_USE_LLM=0 或模型不可用，暂时无法用模型自身能力兜底回答。`
  }

  const top = results.slice(0, 3)
  const bullets = top
    .map((item, index) => `- 【资料${index + 1}】${item.title.replace(/^---$/, '').trim()}：${item.snippet || item.content?.slice(0, 120) || '命中相关资料。'}`)
    .join('\n')

  return `我已从知识库检索到相关资料，但当前 agent 模型综合回答不可用。先给你检索摘要：\n${bullets}`
}

function buildRelatedQuestions(question, results) {
  const text = `${question} ${results.map((item) => `${item.title} ${item.snippet}`).join(' ')}`
  if (text.includes('京剧') && text.includes('昆曲')) {
    return ['京剧有哪些经典剧目？', '昆曲为什么被称为百戏之祖？', '初学者应该先了解京剧还是昆曲？']
  }
  if (text.includes('四大名旦')) {
    return ['四大名旦各自的艺术特点是什么？', '梅兰芳的代表剧目有哪些？']
  }
  return ['这个剧种有哪些代表剧目？', '初学戏曲应该从哪里开始？']
}

function toSourceUrl(sourcePath) {
  return `/api/agent/source?path=${encodeURIComponent(sourcePath)}`
}

function toSources(results) {
  const limit = getConfig().searchLimit
  return results.slice(0, limit).map((item) => ({
    title: item.title,
    path: item.path,
    score: item.score,
    snippet: item.snippet,
    tags: item.tags,
    sourcePaths: item.sourcePaths || [],
    sourceUrls: (item.sourcePaths || []).map(toSourceUrl),
  }))
}

function toLlmSources(results) {
  return results.slice(0, 5).map((item) => ({
    title: item.title,
    path: item.path,
    score: item.score,
    snippet: item.snippet,
    content: item.content,
    tags: item.tags,
    sourcePaths: item.sourcePaths || [],
  }))
}

function toMetaRounds(rounds) {
  return rounds.map((round) => ({
    round: round.round,
    plannerMode: round.plannerMode,
    plannerError: round.plannerError,
    queries: round.queries,
    resultCount: round.resultCount,
    searches: round.searches,
  }))
}

function buildConversationAwareQuestion(question, history = []) {
  const recentHistory = history
    .slice(-6)
    .map((item) => `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`)
    .join('\n')

  if (!recentHistory) return question
  return `最近对话：\n${recentHistory}\n\n当前问题：${question}`
}

export async function searchAgent(question) {
  const retrieval = await retrieveKnowledge(question)
  return {
    query: question,
    provider: 'sage-wiki',
    mode: 'llm-planned-bm25',
    results: toSources(retrieval.rankedResults),
    meta: {
      retrievalRounds: toMetaRounds(retrieval.rounds),
      knowledgeHit: retrieval.knowledgeHit,
    },
  }
}

export async function askAgent({ question, sessionId = '', history = [] }) {
  const config = getConfig()
  const retrievalQuestion = buildConversationAwareQuestion(question, history)
  const retrieval = await retrieveKnowledge(retrievalQuestion)
  const llmSources = toLlmSources(retrieval.rankedResults)
  let answer = ''
  let answerMode = 'fallback-extractive'
  let llmError = ''

  if (config.useLlm && retrieval.knowledgeHit && llmSources.length > 0) {
    try {
      answer = await synthesizeAnswer({ question, sources: llmSources, history })
      answerMode = 'agent-llm-synthesis'
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error)
    }
  }

  if (!answer && config.useLlm && !retrieval.knowledgeHit) {
    try {
      answer = await answerWithoutSources(question, history)
      answerMode = 'llm-self-answer-fallback'
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error)
    }
  }

  if (!answer) {
    answer = buildFallbackAnswer(question, retrieval.rankedResults, retrieval.knowledgeHit)
  }

  return {
    answer,
    sources: retrieval.knowledgeHit ? toSources(retrieval.rankedResults) : [],
    relatedQuestions: buildRelatedQuestions(question, retrieval.rankedResults),
    meta: {
      provider: 'sage-wiki',
      retrievalMode: 'llm-planned-bm25',
      answerMode,
      sessionId,
      historyUsed: history.length > 0,
      retrievalRounds: toMetaRounds(retrieval.rounds),
      knowledgeHit: retrieval.knowledgeHit,
      llmError,
    },
  }
}
