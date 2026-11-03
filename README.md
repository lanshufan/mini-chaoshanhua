# 潮音字典 · 潮汕话小程序

微信原生小程序 + 独立 Node.js 后端。AppID：`wx22ac9a1fd50b56ca`。

## 已实现与实际范围

- 蓝色界面，输入 1–10 个汉字，完整显示词语/成语所有字，点击任一字查看详情。
- 五种口音：汕头（市区）、汕头澄海（澄城）、汕头潮阳（棉城）、潮州（府城）、揭阳（榕城）。
- 本地开源字音库：9,885 个简繁字形索引、2,731 个词条写法；数目包括异体/多种写法，不等于独立词义数量。
- 保留文读、白读、俗读与字义提示。未收录的整词给出明确标注的逐字首选读音参考；不是自动准确连读或翻译。
- 搜索历史保存在设备本地，后端不保存用户查询；支持加载、失败重试、过期响应丢弃。
- 音频清单、播放按钮、HTTP 音频及 Range 接口已经实现；**当前仓库不含真实录音，因此首次运行不能播放五种口音**。字音拼音可真实查询。音频来源仍需补充，不使用普通话合成冒充潮汕话。
- 无数据库、无 AI 密钥、无运行时第三方接口依赖。已生成字库随仓库提供，部署无需 Python 或下载词库。

## 本机运行与微信开发者工具

安装 Node.js 22 或更新版本。项目没有第三方 Node 依赖，不需要 npm install。

```powershell
cd E:\github\mini-chaoshanhua
node --version
npm test
npm start
```

浏览器访问 `http://127.0.0.1:6917/health/ready` 应返回 `ok: true`。

1. 微信开发者工具导入**项目根目录** `E:\github\mini-chaoshanhua`，会自动读取 `miniprogram/` 和已填写的 AppID。
2. 当前 `miniprogram/config.js` 默认后端为 `http://127.0.0.1:6917`。
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

启动时会检查文件名、来源、许可、地区及文件是否存在；清单错误会阻止启动，避免显示假播放按钮。音频作为宿主机只读挂载，更新容器不会删除录音。音频文件默认不提交 Git；音频清单以及实际授权需要自行管理。当前没有网页上传后台。

## API

- `GET /health/ready`：健康与字库/音频数量。
- `GET /api/meta`：口音、资料来源、版本、许可与源码地址。
- `GET /api/lookup?q=你好`：整词详情、全部字卡及各字详情；无匹配时返回明确缺失/逐字参考状态。
- `GET /audio/<manifest中的文件名>`：支持 Range 的录音流，未在清单中的文件不可访问。

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
