<template>
  <div class="page">
    <header class="hero">
      <p class="eyebrow">Font permutation encrypt</p>
      <h1>字体加密 Demo</h1>
      <p class="lead">
        页面看起来是原文，DOM / 复制拿到的是 PUA 密文。换 userId
        会换一套映射，视觉仍可读。
      </p>
    </header>

    <section class="panel">
      <label>
        userId（映射种子）
        <input v-model="userId" />
      </label>
      <label>
        明文
        <textarea v-model="plainText" rows="3" />
      </label>
      <label>
        关键词高亮（可选）
        <input v-model="keyword" placeholder="例如：前端" />
      </label>
    </section>

    <section class="grid">
      <article class="card">
        <div class="card-head">
          <h2>套映射字体后</h2>
          <span class="tag ok">肉眼可读</span>
        </div>
        <p class="hint">浏览器用动态字体把密文画成原文。这是用户看到的效果。</p>
        <div class="preview encrypt" :style="encryptStyle">
          <template v-if="isLoading">生成映射字体中…</template>
          <template v-else>
            <span
              v-for="(part, index) in parts"
              :key="index"
              :style="part.highlight ? KEYWORD_HIGHLIGHT_STYLE : undefined"
            >{{ part.text }}</span>
          </template>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>不套字体 / 复制结果</h2>
          <span class="tag warn">真实 DOM</span>
        </div>
        <p class="hint">开发者工具、爬虫、复制粘贴拿到的是这段 PUA 乱码。</p>
        <div class="preview raw" ref="rawEl">{{ cipherText || '—' }}</div>
        <div class="actions">
          <button type="button" @click="copyCipher">复制密文</button>
          <span v-if="copyHint" class="copy-hint">{{ copyHint }}</span>
        </div>
      </article>
    </section>

    <section class="card wide">
      <h2>码点对照</h2>
      <p class="hint">汉字/字母进 PUA（U+E000 起）；数字、标点等表外字符保持原文。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>明文</th>
              <th>明文码点</th>
              <th>密文</th>
              <th>密文码点</th>
              <th>是否加密</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <td>{{ row.plain }}</td>
              <td class="mono">{{ row.plainCode }}</td>
              <td>{{ row.cipher }}</td>
              <td class="mono">{{ row.cipherCode }}</td>
              <td>
                <span :class="row.encrypted ? 'tag warn' : 'tag mute'">
                  {{ row.encrypted ? '已置换' : '原文' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card wide">
      <h2>换 userId 对比</h2>
      <p class="hint">同一明文，不同用户种子生成不同置换表，复制结果不同。</p>
      <div class="compare">
        <div v-for="item in compareList" :key="item.userId">
          <p class="compare-id">userId = {{ item.userId }}</p>
          <div class="preview encrypt small" :style="item.style">
            {{ item.visual }}
          </div>
          <div class="preview raw small">{{ item.cipher }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import {
  KEYWORD_HIGHLIGHT_STYLE,
  prepareEncryptedText,
  toCodePoints,
  type EncryptHighlightPart,
} from './encrypt';

const userId = ref('10001');
const plainText = ref('张三，前端工程师，工号 A12。');
const keyword = ref('前端');

const parts = ref<EncryptHighlightPart[]>([
  { text: plainText.value, highlight: false },
]);
const fontFamily = ref('');
const cipherText = ref('');
const charMap = ref(new Map<string, string>());
const isLoading = ref(false);
const copyHint = ref('');
const rawEl = ref<HTMLElement | null>(null);
let requestId = 0;

const encryptStyle = computed(() =>
  fontFamily.value
    ? { fontFamily: `"${fontFamily.value}", sans-serif` }
    : undefined
);

const rows = computed(() =>
  [...plainText.value].map((plain) => {
    const cipher = charMap.value.get(plain) ?? plain;
    return {
      plain,
      cipher,
      plainCode: toCodePoints(plain),
      cipherCode: toCodePoints(cipher),
      encrypted: cipher !== plain,
    };
  })
);

const compareUserIds = ['10001', '10002'];
const compareList = ref<
  {
    userId: string;
    visual: string;
    cipher: string;
    style?: { fontFamily: string };
  }[]
>([]);

const render = async () => {
  const id = ++requestId;
  isLoading.value = true;
  const result = await prepareEncryptedText(
    plainText.value,
    userId.value,
    keyword.value
  );
  if (id !== requestId) return;

  parts.value = result.parts;
  fontFamily.value = result.fontFamily;
  cipherText.value = result.text;
  charMap.value = result.charMap;
  isLoading.value = false;
};

const renderCompare = async () => {
  const list = await Promise.all(
    compareUserIds.map(async (id) => {
      const result = await prepareEncryptedText(plainText.value, id);
      return {
        userId: id,
        visual: result.text,
        cipher: result.text,
        style: result.fontFamily
          ? { fontFamily: `"${result.fontFamily}", sans-serif` }
          : undefined,
      };
    })
  );
  compareList.value = list;
};

const copyCipher = async () => {
  const text = rawEl.value?.textContent || cipherText.value;
  await navigator.clipboard.writeText(text);
  copyHint.value = '已复制，到记事本粘贴可看到乱码';
  window.setTimeout(() => {
    copyHint.value = '';
  }, 2000);
};

watch([plainText, userId, keyword], render, { immediate: true });
watch(plainText, renderCompare, { immediate: true });
</script>

<style>
:root {
  color-scheme: light;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: #f4f1ea;
  color: #1c1917;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}

.hero h1 {
  margin: 8px 0;
  font-size: 32px;
}

.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  color: #78716c;
}

.lead,
.hint {
  color: #57534e;
  line-height: 1.6;
}

.panel,
.card {
  background: #fff;
  border: 1px solid #e7e5e4;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.04);
}

.panel {
  display: grid;
  gap: 14px;
  margin: 28px 0;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #57534e;
}

input,
textarea {
  width: 100%;
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  color: inherit;
  background: #fafaf9;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.card.wide {
  margin-bottom: 16px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.tag {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 8px;
}

.tag.ok {
  background: #dcfce7;
  color: #166534;
}

.tag.warn {
  background: #ffedd5;
  color: #9a3412;
}

.tag.mute {
  background: #f5f5f4;
  color: #78716c;
}

.preview {
  min-height: 88px;
  padding: 16px;
  border-radius: 12px;
  font-size: 22px;
  line-height: 1.7;
  word-break: break-all;
}

.preview.small {
  min-height: 56px;
  font-size: 18px;
}

.encrypt {
  background: #f0fdf4;
}

.raw {
  background: #fff7ed;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

button {
  border: 0;
  border-radius: 999px;
  background: #1c1917;
  color: #fff;
  padding: 8px 14px;
  cursor: pointer;
}

.copy-hint {
  font-size: 13px;
  color: #166534;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #f5f5f4;
  font-size: 14px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.compare-id {
  margin: 0 0 8px;
  font-size: 13px;
  color: #78716c;
}

@media (max-width: 800px) {
  .grid,
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
