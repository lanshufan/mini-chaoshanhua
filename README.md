# 潮音字典 · 潮汕话小程序

微信原生小程序 + 独立 Node.js 后端。AppID：`wx22ac9a1fd50b56ca`。

## 已实现与实际范围

- 蓝色界面，输入 1–10 个汉字，完整显示词语/成语所有字，点击任一字查看详情。
- 五种口音：汕头（市区）、汕头澄海（澄城）、汕头潮阳（棉城）、潮州（府城）、揭阳（榕城）。
- 本地开源字音库：9,885 个简繁字形索引、2,731 个词条写法；数目包括异体/多种写法，不等于独立词义数量。
- 保留文读、白读、俗读与字义提示。未收录的整词给出明确标注的逐字首选读音参考；不是自动准确连读或翻译。
- 搜索历史保存在设备本地，后端不保存用户查询；支持加载、失败重试、过期响应丢弃。
- 已接入公开在线参考发音（来源地区标签：汕头、潮州、揭阳），点击喇叭通过本项目后端获取 MP3；保留本地录音优先。**在线音源不保证三地口音独立：实测“你好”三路音频完全一致。澄海、潮阳没有接入独立音源。**
- 文字查询使用本地字库，无数据库、无 AI 密钥。在线参考发音依赖第三方非官方接口；字库查询不依赖该接口。已生成字库随仓库提供，部署无需 Python 或下载词库。

## 本机运行与微信开发者工具

安装 Node.js 22 或更新版本，以及支持 libmp3lame 的 FFmpeg（放入 PATH，或用环境变量 FFMPEG_PATH 指定可执行文件路径）。在线音频处理和音频回归测试需要 FFmpeg；Docker 镜像已自动安装。项目没有第三方 Node 依赖，不需要 npm install。

```powershell
cd E:\github\mini-chaoshanhua
node --version
npm test
npm start
```

浏览器访问 `http://127.0.0.1:6917/health/ready` 应返回 `ok: true`。

1. 微信开发者工具导入**项目根目录** `E:\github\mini-chaoshanhua`，会自动读取 `miniprogram/` 和已填写的 AppID。
2. 当前 `miniprogram/config.js` 后端为 `https://games.issuescook.cn/chaoshan`；本机调试可改为 `http://127.0.0.1:6917`。
3. 仅本机开发调试时，在开发者工具「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。正式/真机使用下一节的 HTTPS 地址。
4. 编译并搜索：`你`、`你好`、`犀牛`、`新年快乐`。搜索“你好”应显示两个字；点“好”后能查看五地单字读音。
5. 手机上的 `127.0.0.1` 指手机自身；真机请使用部署后的 HTTPS 地址。

本次执行环境默认 node 为 16，因此测试使用机器上另一个现代 Node 运行时；你若在终端看到 v16，请升级/切换 Node 22 后运行。

## 服务器部署（Docker）

```sh
git clone https://github.com/lanshufan/mini-chaoshanhua.git
cd mini-chaoshanhua
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:6917/health/ready
curl --get --data-urlencode 'q=你好' http://127.0.0.1:6917/api/lookup
```

独立 Compose 项目 `mini-chaoshanhua`，宿主机仅监听 `127.0.0.1:6917`。不依赖猜人物或梦境服务，不占用其 6916 端口。若 6917 已占用，修改 Compose 宿主机端口及 Nginx 上游地址。

将 `nginx.conf.example` 中两个 location 加入你的已有 HTTPS server 块。保留现有证书和其他服务的 location；已有 `/chaoshan/` 时替换该段，不要重复添加。示例包含转发头、超时、8k 请求体限制及音频 Range 转发，`^~` 避免被站点通用音频文件正则 location 抢先处理。8k 只限制请求体，不限制音频下载大小。该配置假设 Nginx 在宿主机上运行。然后检查并重载：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

小程序 `miniprogram/config.js` 修改为：

```js
module.exports = { apiBaseUrl: 'https://你的域名/chaoshan' };
```

微信小程序后台把 `https://你的域名` 加入 request 合法域名；接入音频后也配置下载合法域名，真机验证播放。域名必须使用有效 HTTPS 证书。不要把示例“你的域名”直接用于生产。

更新：`git pull --ff-only` 后执行 `docker compose up -d --build`。查看日志：`docker compose logs --tail=100 -f`。停止：`docker compose down`。

## 添加真实录音

把获准使用的 `.mp3`、`.wav` 或 `.m4a` 文件放到 `audio/`。文件名仅使用英文字母、数字、下划线、连字符。编辑 `audio/manifest.json`，例（需先放入真实文件，不能照抄不存在的文件名）：

```json
{
  "shantou:你好": {
    "file": "shantou-nihao.mp3",
    "source": "录音来源或原始链接",
    "license": "实际使用授权说明",
    "speakerRegion": "汕头市区"
  }
}
```

口音键：`shantou`、`chenghai`、`chaoyang`、`chaozhou`、`jieyang`。冒号后是完整查询文字。一个词语的录音必须是该词语的完整读音，不能用同一音频冒充五种口音。每种口音分别录入。重启 `docker compose restart` 后加载清单，前端自动启用对应按钮。

启动时会检查文件名、来源、许可、地区及文件是否存在；清单错误会阻止启动，避免显示假播放按钮。音频作为宿主机只读挂载，更新容器不会删除录音。音频文件默认不提交 Git；音频清单以及实际授权需要自行管理。当前没有网页上传后台。在线参考发音与本地录音分开，供应商参考音频不会写入 audio/。

## API

- `GET /health/ready`：健康与字库/音频数量。
- `GET /api/meta`：口音、资料来源、版本、许可与源码地址。
- `GET /api/lookup?q=你好`：整词详情、全部字卡及各字详情；无匹配时返回明确缺失/逐字参考状态。
- `GET /audio/<manifest中的文件名>`：支持 Range 的录音流，未在清单中的文件不可访问。
- `GET /api/audio?q=你好&region=shantou`：在线 MP3 参考音频；仅支持 shantou、chaozhou、jieyang，支持 Range/HEAD，错误返回 JSON；无音轨不会换用其他地区的录音。

## 数据来源、许可与重建

来源与修改说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。代码按 AGPL-3.0-or-later 发布；字库按 CC-BY-SA-4.0 发布，请保留署名及相同方式共享要求。后台运行无需重新构建字库。

若需要修改原始数据后重建，用 Python 3.10+：

```sh
python -m venv .venv
# Linux: source .venv/bin/activate；Windows: .venv\Scripts\Activate.ps1
python -m pip install -r scripts/requirements.txt
python scripts/build-data.py
npm test
```

转换后数据在 `server/data/dictionary.json`。上游 Python 库及生成的 protobuf 模块保存在 vendor 中；重建过程不需要访问上游网络。该版本只转换原生字表和词表，未引入外部语料子仓库。拼音保留数字调类，不承诺任何输入的自动连读调值正确。

## 验证范围

自动测试覆盖真实数据差异、多字/重复字/长度/非法输入、整词与逐字降级、全部生成读音类型、HTTP、音频范围请求与目录限制、小程序连接真实 HTTP 及异步查询清空。测试音频是临时二进制夹具，不代表已有真实人声。

本机未安装 Docker，本次没有实际执行镜像构建；尚未进行微信开发者工具视觉验收、真机音频和公网 HTTPS 联调。部署后按上面的步骤验证。

## 在线参考发音（2026-11-04 接入）

默认启用 `AUDIO_PROVIDER=chaofayin`，本机启动和 Docker 使用同一规则。重新构建并启动后端后，重新搜索“你好”，汕头、潮州、揭阳栏应出现蓝色喇叭按钮。澄海、潮阳仍需要独立音源；已有授权的本地录音优先使用。

```sh
docker compose up -d --build
curl --get --data-urlencode 'q=你好' 'http://127.0.0.1:6917/api/lookup'
curl --fail --get --data-urlencode 'q=你好' --data-urlencode 'region=shantou' 'http://127.0.0.1:6917/api/audio' --output test-nihao.mp3
```

小程序继续通过自己的 `/chaoshan/api/audio` 播放，无需把上游域名加入小程序配置。更新后端也需要重新编译前端才能看到新的说明及按钮文字。关闭在线音源时，服务器的 `.env` 设置 `AUDIO_PROVIDER=none` 后重新创建容器；本机 PowerShell 可设置 `$env:AUDIO_PROVIDER='none'` 再启动。关闭后仅使用本地录音清单。

实现：查询时不访问外部音源；点击播放才查询对应文字，按来源字段选择地区音轨并获取 MP3。元数据仅缓存在内存10分钟，最多100组，同文字共用查询结果；不批量下载、不持久化第三方录音。新文字请求全局间隔10秒，过快返回429及 Retry-After，相同文字切换地区不受此限制。单次上游请求7秒超时，音频上限4MiB，并检查 MP3 头；随后使用 FFmpeg 解码整段并重新编码为统一的单声道 MP3，修复上游拼接文件的时长头与声道切换导致微信只播放前段的问题。处理上限10秒，不写入磁盘；失败时明确报错。在线服务故障不影响本地字库查询。

该服务没有公开的正式第三方接入合同或许可，当前接入用于验证技术可行性，不能据此宣称已取得商用授权或稳定服务承诺。实测“你好”的三个地区标签返回完全相同的音频，界面已明确提示地区差异未核实。此接入不代表五种独立口音已完成。完整调查、其他开发者的实现及合作候选见 [AUDIO_SOURCES.md](AUDIO_SOURCES.md)。

## 多字音频播放修复（2026-11-12）

上游“鞠躬尽瘁”的 MP3 存在拼接及声道切换。后端现在统一解码、重新编码后返回，音频链接添加版本参数避免沿用旧缓存。回归测试验证拼接音频的前后两段均保留；实际样本处理后可完整解码约3.79秒，微信真机仍需复测。

已有部署执行 `git pull --ff-only` 和 `docker compose up -d --build`，必须重建镜像以安装 FFmpeg，不能仅重启旧容器。之后重新搜索词语再播放；本次修复无需修改小程序前端。


## 澄海参考音频试用（2026-11-13）

仅覆盖“心”字（chenghai），默认关闭。潮阳仍无已核实音源。证据、音源及核查限制见 AUDIO_SOURCES.md 的本次记录。

在服务器项目根目录更新并试用：

```sh
git pull --ff-only
CHENGHAI_AUDIO_TRIAL=true docker compose up -d --build
curl --fail --get --data-urlencode 'q=心' --data-urlencode 'region=chenghai' http://127.0.0.1:6917/api/audio --output chenghai-xin.mp3
```

小程序重新搜索“心”，澄海喇叭会启用；其他未核实字词仍灰色。“心心”等整词不会拼接冒充整词录音。上面的临时环境变量仅用于这次创建容器；要持续启用，在项目 `.env` 中设 `CHENGHAI_AUDIO_TRIAL=true`。关闭时改为 false 并重新创建容器。

### 后端怎样返回音频

1. `server/dictionary.js` 查询字音，本地 `audio/manifest.json` 的真实录音优先。
2. `server/remote-audio.js` 的 `decorate()` 为三地在线参考音及开启试用后的“chenghai:心”生成本项目 `/api/audio` 链接，不在查询时访问上游。
3. 点击喇叭后前端播放该 HTTPS 链接。`server/app.js` 的 `/api/audio` 路由调用 `remoteAudio.get(q,region)`。
4. 汕头、潮州、揭阳走现有 chaofayin 服务；澄海“心”走代码中固定且已核实的 HTTPS 文件地址。其他澄海、潮阳查询返回404，不回退到其他地区。
5. 获取时限制超时、大小、并发并检查 MP3。`server/normalize-audio.js` 用 FFmpeg 统一音频格式，`sendOnlineAudio()` 返回音频字节，支持 Range / HEAD。
6. 前端 `wx.createInnerAudioContext()` 直接播放自己的后端链接，不增加下载文件保存逻辑；只显示加载、播放状态，失败提示“播放失败”。

这条链路不需要 AI 模型，也没有部署新的 TTS 服务。此次本地实测后端链路成功；用户服务器与微信真机需要更新后复测。


## AI 潮汕话搜索建议

普通查词先返回原有结果；去掉标点、空格后超过 3 个汉字才异步请求建议（仍最多 10 字）。仅显示 AI 有把握且不同于原文的表达，点击「搜搜」沿用查词接口，该次不再生成建议。编辑、清空或再次搜索会使旧建议失效。AI 超时、故障或额度耗尽不影响查词。

在部署目录 `.env` 填入与猜人物服务相同的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 和已有 `REDIS_URL`，不要将密钥放入小程序。`REDIS_PREFIX` 默认 `chaoshan:`，与猜人物会话隔离。`LLM_MAX_CALLS_PER_DAY` 默认 200，为本功能独立每日 UTC 调用上限。未配置模型或 Redis 时不显示建议；Redis 不可用时停止新模型调用以避免无缓存收费。Redis 启动连接失败后需重启服务恢复。

同一查询的标点、空格变体共用缓存：建议缓存 7 天，无建议缓存 1 天；模型故障不缓存。通过 Redis 锁合并并发请求，缓存键包含提示词版本。部署使用 `docker compose up -d --build`，小程序界面需重新预览或上传。查询文字会发送给所配置的 AI 服务，发布时同步更新小程序隐私说明。
