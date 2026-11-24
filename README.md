# 潮音字典 · 潮汕话小程序

输入 1–10 个汉字，查看汕头市区、澄海（澄城）、潮阳（棉城）、潮州（府城）和揭阳（榕城）的读音。搜索「你好」可以查看整词，再点「好」比较各地的单字读音、文白读和释义。字库未收录整词时，结果会标为逐字读音参考。

项目包含微信原生小程序和 Node.js 后端。字库随仓库提供，基本查词无需数据库或模型密钥。五地均可查询字音，录音覆盖范围见下文。

## 快速开始

安装 Node.js 22 或更高版本。在线发音处理和音频测试还需要支持 `libmp3lame` 的 FFmpeg，将其加入 PATH，或通过 `FFMPEG_PATH` 指定可执行文件。

```sh
git clone https://github.com/lanshufan/mini-chaoshanhua.git
cd mini-chaoshanhua
npm ci
npm start
```

打开 [本地健康检查](http://127.0.0.1:6917/health/ready)，确认 JSON 中的 `ok` 为 `true`。

1. 在微信开发者工具导入刚克隆的仓库根目录。工具会从 [project.config.json](project.config.json) 读取小程序目录，自行发布时请使用自己的 AppID。
2. 在 [miniprogram/config.js](miniprogram/config.js) 将 `apiBaseUrl` 改为 `http://127.0.0.1:6917`，让模拟器连接本机后端。
3. 本机调试时，在开发者工具的「详情 → 本地设置」开启「不校验合法域名」选项，编译后搜索「你好」。真机上的回环地址指向手机自身，真机测试请使用已部署的 HTTPS 服务。

## 部署词典服务

在仓库根目录运行以下命令，仅启动查词所需的容器。镜像包含 FFmpeg，服务默认绑定宿主机的回环地址。

```sh
docker compose up -d --build dictionary
curl http://127.0.0.1:6917/health/ready
```

将 [nginx.conf.example](nginx.conf.example) 中匹配 `/chaoshan` 和 `/chaoshan/` 的两段配置加入宿主机 Nginx 的 HTTPS 站点，执行 `nginx -t` 后重载。将小程序的 `apiBaseUrl` 改为自己的服务地址，例如 `https://example.com/chaoshan`，在微信公众平台将实际域名加入 request 和 downloadFile 合法域名，重新编译小程序。

## 发音与录音

- **在线参考发音**默认启用。点击播放时，后端把查询文字发送给第三方音源。汕头、潮州和揭阳是音源的地区标签，同一词的三个标签可能对应同一段录音。第三方音频的商用授权尚未确认。来源与核查记录见 [音源说明](AUDIO_SOURCES.md)。
- **澄海试用音频**仅覆盖「心」，默认关闭。使用 Docker 时，可在仓库根目录的 `.env` 设置 `CHENGHAI_AUDIO_TRIAL=true` 后重新创建词典容器。潮阳可通过本地录音补充。
- **仅使用本地录音**时，设置 `AUDIO_PROVIDER=none` 并保持澄海试用关闭。查词使用本地字库，在线音源故障时仍可查看文字结果。

如需添加录音，将有权使用的 MP3、WAV 或 M4A 文件放入 [audio/](audio/)，并在 [manifest.json](audio/manifest.json) 中登记来源、授权和录音地区。例如，添加完整的汕头话「你好」录音后，可以使用以下条目：

```json
{
  "shantou:你好": {
    "file": "shantou-nihao.mp3",
    "source": "填写实际录音来源",
    "license": "填写实际使用授权",
    "speakerRegion": "汕头市区"
  }
}
```

地区键为 `shantou`、`chenghai`、`chaoyang`、`chaozhou`、`jieyang`。文件名主体可使用英文字母、数字、下划线和连字符。重启词典服务后，相应字词会优先播放该地区的本地录音。

## 可选服务

**AI 搜索建议**适用于去除标点和空格后有 4–10 个汉字的查询。启用时，查询文字会发送给配置的模型服务，建议结果缓存在 Redis。Docker 部署可参照 [.env.example](.env.example) 在服务端设置 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 和 `REDIS_URL`，再重新创建词典容器。`LLM_MAX_CALLS_PER_DAY` 默认为 200 次，按 UTC 日期计数。上线时应在小程序隐私说明中说明数据用途。

**意见反馈**支持提交反馈、查看处理状态和管理员回复。独立部署需要 MySQL、自己的微信 AppID 和对应的 AppSecret。请按 [反馈服务部署说明](feedback-service/README.md) 配置数据库、管理入口和小程序的 `feedbackBaseUrl`。

## API

以下路径均相对于词典服务根地址。使用示例 Nginx 配置时，公网路径带有 `/chaoshan` 前缀。

| GET 路径 | 返回内容 |
| --- | --- |
| `/health/ready` | 服务就绪状态与数据数量 |
| `/api/meta` | 地区、字库来源、许可及音频信息 |
| `/api/lookup?q=你好` | 整词结果、单字详情与发音入口 |
| `/api/suggestion?q=新年快乐` | 可选的 AI 搜索建议 |
| `/api/audio?q=你好&region=shantou` | 在线参考音频 |
| `/audio/<文件名>` | 已在清单中登记的本地录音 |

## 开发与数据许可

在仓库根目录运行 `npm test` 可验证字库查询、HTTP 接口、音频处理及小程序交互逻辑。

生成的字库位于 [server/data/dictionary.json](server/data/dictionary.json)。修改上游字表或词表后，可在 Python 3.10+ 虚拟环境中重建：

```sh
python -m pip install -r scripts/requirements.txt
python scripts/build-data.py
npm test
```

项目代码采用 [AGPL-3.0-or-later](LICENSE)，字库采用 [CC BY-SA 4.0](vendor/pujbase/LICENSE-CC-BY-SA)。数据署名、上游来源与修改说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。
