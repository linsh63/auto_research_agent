# Plugin 扩展教程

复制 `docs/templates/plugin/package.json`，填写稳定 package 名、SemVer、许可证、维护者和 `autoResearch` 元数据。权限、side effect、依赖、贡献类型和兼容范围必须在用户安装前可见。

Plugin 目录接入流程是 source add → refresh → search/inspect → install → enable。refresh 只静态读取 descriptor，不执行代码；安装固定版本和内容 hash。默认使用 Project scope。权限扩大需要重新批准，来源内容漂移会 quarantine 已安装版本。

Pi extension 会自动获得 `host.full`，skill 会自动获得 `model`，因为这是实际运行边界。不要通过描述文字淡化权限。Plugin 无权直接修改 ResearchEvent、读取 confirmation mount 或绕过 Core Service。
