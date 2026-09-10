# word-translator

翻译工具：将英文文本按原文顺序拆解为逐词、有效短语、逐句和整段翻译。

## 本地运行

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env.local`，填写 SiliconFlow 的密钥及模型配置。
3. 运行：`npm run dev`

每位部署者应使用自己的 API Key。密钥只在服务端读取，不能提交到仓库。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key |
| `TRANSLATION_MODEL` | 翻译模型，默认 `tencent/Hunyuan-MT-7B` |
| `ANALYSIS_MODEL` | 支持 JSON 输出的英文短语解析模型 |

计划域名：`translate.cc1204.cn`。
