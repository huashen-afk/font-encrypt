<div align="center">

# DOM text encryption

<img width="1079" height="294" alt="d6e15dba6329808c23c62b8602108c7a" src="https://github.com/user-attachments/assets/e21af93f-82ec-46c5-a5b2-ab96a30304da" />

<img width="616" height="126" alt="image" src="https://github.com/user-attachments/assets/ce0fed25-c33b-4059-b5ab-ea0a637fb180" />

</div>

## On frontend encryption

> **Up front:** a capable attacker can reverse the in-browser encrypt/decrypt logic and recover the public/private keys. Encryption that lives entirely on the frontend is impossible in any fundamental sense.

We can still do some light encryption so that a generic crawler cannot scrape page content with almost no effort.

### Main ideas

#### 1. Hash the selectors

Take selectors like `.header .my-text`, combine a `userId` (or some other unique id) with a changing value as the seed, and hash that.

Selectors on the page are effectively reset every time, so a crawler cannot pull plaintext through a **fixed selector**.

`div` and `p` cannot be rewritten this way. A crawler can still grab plaintext by “the 3rd `p`” / “the 1st `div`”.

#### 2. Encrypt text in the DOM *(what this repo shows)*

The obvious next step is to encrypt the DOM text itself. Even if the crawler finds the node, it still gets ciphertext.

Build a mapping table, e.g. `一 → 咕`, `咕 → 嘎` — an encrypt/decrypt table.

For English, use a **dynamic alphabet** or a **dynamic word list**.

This repo maps `一 → U+E0xx`, hangs the path of 一 on that code point, and substitutes via a generated table. Most mapped values have no real character, so you mostly see **garbage**.

##### Rendering for method 2

Canvas (or similar image rendering) / **custom font (this project)** / slicing characters into images

1. **Canvas:** whether you `fillText` or turn it into SVG, you are stacking another layer on top of the encryption. The 咕/嘎 becomes whatever canvas can recognize as features. It can feel like overkill, but without OCR it is hard to recover plaintext by decrypting.

   Also, with a lot of text, canvas often runs after first paint, so you see characters appearing one by one, like streaming output. You generally have to wait until it is fully drawn before treating the first screen as ready. CSS and positioning will drift, and it adapts poorly across screens.

2. **Custom fonts:** usually `@font-face` or `new FontFace()` to attach a dynamic font. The browser lays out as usual; only the glyphs change. `font-family` is your own. This project uses `opentype.js` to rewrite the font and drive the mapping table.

#### 3. Server-side rendering

If the API returns plaintext, the encryption is pointless — intercept the response and you are done.

So you encrypt the API payload and let the frontend decrypt it.

From there it is a short step to send the whole HTML from the server. That HTML can be encrypted too, which raises the bar further.

Font files are usually large. The server can figure out which font the client is supposed to use and send only that — **faster first paint**, less of the mapping table leaked.

Dynamic selector hashing is usually done on the server as well. The changing seed has to stay in sync between frontend and backend, or decryption fails.

<p align="center"><b>In practice you combine 1+2+3.</b> See Qidian’s paid VIP chapters: hashing + mapping table + SSR.</p>

---

<div align="center">

# DOM内文本加密

</div>

## 关于前端加密技术

> **事先说明：** 若攻击者有能力，其可以通过反编译拿到浏览器加密解密逻辑，进而获取到公钥私钥，完全依赖前端来实行的加密从根本上不可能

不过，我们依旧可以进行一些简单的加密，防止未经定制化的爬虫轻而易举的爬取页面内容。

### 主要的加密思路

#### 1. 将标签哈希化

将像是 `.header .my-text` 这样的标签根据 `userId` 或者其他唯一标识符 + 动态变化值，将其组合作为种子，转化为哈希值。

相当于每次页面的标签都会重设，爬虫没法通过**固定的标签**拿到明文。

当然，`div` 和 `p` 没法转化，爬虫可以通过获取 “第3个 `p` 标签” “第1个 `div` 标签” 的思路去拿到明文。

#### 2. 将 DOM 内文本加密 *(本仓库展示的内容)*

理所因当的，我们会想到直接将 DOM 内文本加密，这样爬虫就算通过标签拉到文本，最终得到的也还是密文。

思路为：构建一个文本映射表，比如 `一 -> 咕`，`咕 -> 嘎`，相当于加密/解密表。

对应英文加密，应当使用**动态字母表**，或**动态词表**去进行加密。

本仓库会使用 `一 → U+E0xx` 再将 一 的 path 挂载到对应的码点，然后通过自动生成的映射表去映射，映射值大多没有对应的字，所以基本上都是**乱码**。

##### 关于方法 2 的渲染思路

Canvas 渲染或类似的图像渲染 / **自定义字体库（本项目使用）** / 文字切图化

1. **Canvas：** 不管是 `fillText` 渲染还是转化为 SVG 渲染，都相当于会给加密上面再套上一层加密，这里的 咕嘎 会转化为 canvas 识别的特征码，也因此有些脱裤子放屁的感觉，不过通过这种方式，除非使用 OCR，否则很难通过解密来获取明文。

   另外，若对于大量的文本需要加密，由于 canvas 渲染位置通常在首屏加载后，会看到一个字一个字不断被渲染的效果，类似于流式输出，一般需要等待完全显示后再去加载首屏。并且对于一些 CSS 样式和位置问题，会存在明显的偏差，对各类屏幕的适配性也存在不足。

2. **字体库：** 一般是 `@font-face` 或 `new FontFace()` 把动态字体挂上，浏览器会正常排版，仅为字体显示变化，`font-family` 为自己定义的，项目内使用 `opentype.js` 用于修改字体库和控制映射表。

#### 3. 服务端渲染

若接口拉的内容全都是明文，那加密就没有必要做了，直接拦截接口值即可。

所以会想到加密接口值，传给前端由其自行解密。

也因此，能想到直接将整个 HTML 由服务端传给客户端，这里的 HTML 也可以使用加密，进一步增加破译难度。

能够想到，字体库的文件通常很大，服务端有能力去获取客户端“应该”使用的字体，然后传给前端，既**加快首屏速度**，又减少映射表泄漏的风险。

标签动态哈希也通常由服务端去执行，这里的动态变化值需要前后端完全同步，否则会出现解密失败的问题。

<p align="center"><b>所以，实际情况都是 1+2+3 复合使用。</b> 参考起点中文网的付费 VIP 章节，它使用了哈希 + 映射表 + 服务端渲染。</p>
