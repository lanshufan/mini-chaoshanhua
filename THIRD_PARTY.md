# 数据与来源

字音、词条、口音规则来自 https://github.com/pujdict/pujbase ，固定版本 fe84c5fc82436bf27dafb9b8b987628b53deed14。
原作者：PUJDICT 项目贡献者。原始数据采用 CC-BY-SA 4.0；转换后的 server/data/dictionary.json 继续采用 CC-BY-SA 4.0。代码采用 AGPL 3.0；本独立项目代码同样按 AGPL 3.0-or-later 发布。许可全文在 LICENSE 和 vendor/pujbase/LICENSE-*。

修改：通过原项目转换库生成五种口音的潮拼，保留文白读、频率、释义及各地又音；索引简繁字形；转换原生词表；新增 HTTP 查询、小程序和部署配置。未包含外部语料子仓库。

代表点：汕头市区、澄海澄城、潮阳棉城、潮州府城、揭阳榕城。它们不能代表各区县的全部乡镇口音。数字为调类，未将调类自动解释为实际连读调值。

代码及数据来源可从首页“关于”入口和 /api/meta 查看。音频清单须独立标记来源、许可、发音地区，本仓库当前不附带真实录音。
