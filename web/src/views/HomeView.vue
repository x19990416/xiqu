<script setup lang="ts">
import { computed } from 'vue'
import homeHeroUrl from '../assets/images/home-hero.jpg'

const lunarDayMap = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

function formatLunarDate(date: Date) {
  const formatter = new Intl.DateTimeFormat('zh-Hans-CN-u-ca-chinese', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const parts = formatter.formatToParts(date)
  const yearName = parts.find((part) => String(part.type) === 'yearName')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const dayValue = Number(parts.find((part) => part.type === 'day')?.value)
  const day = lunarDayMap[dayValue - 1] ?? `${dayValue}`

  return {
    year: `${yearName}年`,
    date: `${month}${day}`,
  }
}

const lunarDate = computed(() => formatLunarDate(new Date()))
</script>

<template>
  <main class="xiqu-page home-page">
    <section class="home-hero" aria-label="首页视觉">
      <img class="home-hero__image" :src="homeHeroUrl" alt="戏曲山水亭台视觉" />
      <div class="home-lunar-date" aria-label="今日阴历日期">
        <span>{{ lunarDate.year }}</span>
        <span>{{ lunarDate.date }}</span>
      </div>
      <RouterLink class="home-graph-entry" :to="{ name: 'wiki-graph' }" aria-label="打开戏曲知识图谱">
        <span>知识图谱</span>
        <small>探索剧种、行当与舞台元素</small>
      </RouterLink>
    </section>
  </main>
</template>
