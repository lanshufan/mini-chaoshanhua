# 独立反馈服务

沿用已创建的 mini_feedback 五张表，不需要再次建库。目录中 schema.sql 是当前结构的参考副本。运行 Node 22，部署为独立容器，端口 6918，仅绑定宿主机回环地址；原词典服务继续使用 6917。

## 部署步骤

1. 将根目录 .env.example 新增的 FEEDBACK_*、WX_APP_SECRET 配置填入服务器 .env。数据库使用反馈专用账号，只授予 mini_feedback 的 SELECT/INSERT/UPDATE/DELETE，不使用 root。MySQL 在可信内网；跨公网连接不属于本配置支持范围。
2. FEEDBACK_IDENTITY_KEY 使用至少 32 字符的随机密钥（例如 `openssl rand -hex 32`），单独备份，不能随意更换；不上传代码仓库。WX_APP_SECRET 从微信公众平台获取，不填写到小程序代码。
3. 填写 FEEDBACK_PRIVACY_TEXT 的实际运营主体、联系方式、保存期限、查询/删除/撤回途径，并在微信后台更新隐私保护指引。填写 FEEDBACK_PRIVACY_VERSION，变更说明时升级版本。小程序首次进入只加载说明，同意后才进行微信登录并创建身份标识。
4. `docker compose up -d --build feedback`。启动会检查必需配置和数据库连接；未配置时拒绝启动。修改 Nginx，加入 nginx.conf.example 的 feedback 专用 location，并确保它位于同一 HTTPS server；执行 `nginx -t` 后重载。
5. 创建管理员：`docker compose exec -T feedback node create-admin.js`，通过标准输入传入一行 JSON：`{"username":"你的管理员名","password":"至少16位独立随机密码","displayName":"管理员"}`，然后结束输入。不要将实际密码写到命令参数、代码或共享终端记录中；也可从权限受限的临时文件通过 stdin 输入，完成后安全清理。
6. 打开 `https://games.issuescook.cn/chaoshan/feedback/` 登录管理。只能用 HTTPS；安全 Cookie 不支持纯 HTTP 登录。服务重启会使会话失效，需重新登录。
7. 微信开发者工具导入词典项目，上传新版本；request 合法域名仍使用 https://games.issuescook.cn。若更换域名，同时更新 miniprogram/config.js 的 feedbackBaseUrl 和 FEEDBACK_PUBLIC_URL。

## 功能和安全措施

- 用户：每页 30 条反馈、最多 500 个 Unicode 码点、提交重试幂等、查看公开回复与状态、未读提示、删除反馈及关联回复。
- 管理员：分页与状态筛选、公开回复或内部备注、状态变更记录。用户端不查询内部备注，管理员变更采用行锁+版本校验+事务。
- 所有数据库输入均绑定参数，禁止多语句执行；不将用户输入拼入 SQL、表名或排序字段。长度、类型、状态、分页编号、JSON 体积由后端检查。
- 身份由后端使用微信 code 换取 OpenID 并生成带密钥的摘要。不会信任前端 userId，不存储原始 OpenID 或 session_key；每次用户读/删反馈均约束 user_id。
- 管理员密码用随机盐 scrypt 保存；没有默认账号。管理员 Cookie 为 Secure/HttpOnly/SameSite=Strict，写入请求校验 Origin 和独立 CSRF token；登录失败使用一致提示。管理员禁用后当前会话也不能继续访问。
- 后台只使用 textContent 显示用户内容，禁止 HTML 渲染；设置 CSP、禁止页面嵌入、禁缓存。会话、限流记录只在服务内存，不记录正文、密码或 token。
- 登录 5 次/IP/15 分钟、30 次全局/15 分钟；用户反馈 5 次/小时；一般请求 180 次/IP/分钟。限流和会话是单实例设计，重启会重置；横向扩容前应改用共享 Redis。公网后台建议另加 VPN/IP 白名单或身份代理，防止恶意请求耗尽全局登录额度。
- TRUST_PROXY=true 仅在服务通过宿主机 Nginx 访问且端口不暴露公网时使用；Nginx 必须覆盖 X-Real-IP。不能直接对公网开放容器端口。

## 隐私和运维边界

当前用户可删除自己的反馈及关联回复/历史，但自动到期清理尚未启用。purge_after 预留字段不是清理功能，不能在隐私说明宣称已自动删除。保留期限到期需运营方落实删除任务，同时覆盖无关联用户标识、日志与备份。通过隐私联系渠道处理导出、撤回和完整账户数据删除。

Nginx 反馈路径关闭访问日志；错误日志、基础设施日志、备份仍需运营方检查。数据库中没有手机号、头像、昵称、位置字段，但身份摘要和反馈仍属于用户信息处理。仅完成自定义告知不代表完成所有平台要求；上线时应核对微信后台隐私接口清单和实际处理行为。

页面默认展示最多 300 条回复及 300 条状态记录（普通反馈远低于此量）；历史超过这个数量时应扩展分页。当前回复和状态历史分区展示，不是混合时间线。

## 验证

`npm ci`，`npm test`。自动测试覆盖密码校验、权限边界、CSRF、注入载荷按值处理、JSON 体积与字数限制、公开回复筛选、并发版本冲突和事务回滚。实际微信登录需真实 AppSecret；上线前还需在微信开发者工具/真机验证登录、提交和回复流程。
