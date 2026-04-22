# v0.15.47-user-sync-docker-network-diagnostics

## 迭代完成说明

- 将用户人员同步的外部请求从通用 fetch 改为显式的 Node HTTP/HTTPS 请求，保留现有代理引导能力在 docker 场景下对人员同步请求真正生效。
- 为 token 获取与人员数据拉取补充明确错误定位信息：失败阶段、目标地址、代理状态、TLS 校验状态、底层错误 code/cause，以及针对 DNS、超时、证书、代理的定向排障提示。
- 在用户同步任务失败时补充服务端日志输出，便于直接从容器日志定位问题。
- 为运行镜像补充 ca-certificates，并在环境变量示例中新增人员同步代理/TLS 排障配置说明。

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  server/services/user-sync-service.ts \
  server/services/user-sync-job-manager.ts
```

- 定向类型/问题检查：确认上述改动文件与 Dockerfile 无新增问题。
- 连通性判别：本地宿主机对人员同步目标地址发起无凭证请求可达；当前会话环境未提供 docker CLI，无法在同机容器内完成真实容器态网络复测。

## 发布/部署方式

- 重新构建并发布 packages/nextclaw-digital-employee 的 docker 镜像，使运行层包含 ca-certificates 与新的人员同步请求实现。
- 若部署环境需要代理出网，请为容器配置 HTTPS_PROXY / HTTP_PROXY / NO_PROXY。
- 若目标接口使用内网自签名证书且短期无法补齐 CA，可临时设置 PERSONNEL_SYNC_SKIP_TLS_VERIFY=true 排障；正常生产环境仍应优先安装正确证书链。

## 用户/产品视角的验收步骤

1. 重新部署镜像后，在用户管理页触发“同步人员”。
2. 若同步成功，任务应正常进入完成态并展示新增/更新统计。
3. 若外部接口仍不可达，页面错误提示应明确指出是在“获取 token”还是“拉取人员数据”阶段失败，并附带 DNS、代理、TLS 或超时类提示。
4. 查看容器日志时，应能看到用户同步任务失败的完整错误链，而不是只有笼统的 fetch failed。
5. 若容器位于受限网络环境，补充代理或证书配置后再次同步，应能恢复成功。