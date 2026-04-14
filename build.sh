#!/bin/sh
export http_proxy=http://172.31.1.95:1080
export https_proxy=http://172.31.1.95:1080
pnpm config set registry https://registry.npmmirror.com
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile
if [ $? -ne 0 ];then
  echo -e "\033[31mpnpm install --frozen-lockfile处理依赖失败!\033[0m"
  exit 1
fi
pnpm --filter @nextclaw/digital-employee build
if [ $? -eq 0 ] && [ -d packages/nextclaw-digital-employee/dist ]; then
   echo -e "\033[32m项目构建成功!\033[0m"
else
  echo -e "\033[31mpackages/nextclaw-digital-employee编译失败!\033[0m"
  exit 1
fi

# ── Install knex-dm / dmdb runtime deps (CJS drivers that Nitro cannot bundle) ──
# 安装到 dist/node_modules/（对应容器 /app/node_modules/），该目录 Nitro 不会创建，
# 不存在与 dist/server/node_modules/ 合并冲突的问题。
# createRequire(resolve(process.cwd(), "index.js")) 恰好从 /app/node_modules/ 解析。
DE_DIST_DIR="packages/nextclaw-digital-employee/dist"
echo -e "\033[34m[deploy] 安装 knex-dm 运行时依赖...\033[0m"
KNEX_TMP=$(mktemp -d)
echo '{"private":true,"dependencies":{"knex-dm":"^1.0.48662","dmdb":"^1.0.48286","knex":"^3.1.0"}}' > "$KNEX_TMP/package.json"
(cd "$KNEX_TMP" && npm install --omit=dev --registry https://registry.npmmirror.com)
if [ $? -ne 0 ]; then
  rm -rf "$KNEX_TMP"
  echo -e "\033[31m[deploy] knex-dm 依赖安装失败!\033[0m"
  exit 1
fi
# dist/node_modules/ 不存在时 cp -r 直接创建，不会产生嵌套
cp -r "$KNEX_TMP/node_modules" "$DE_DIST_DIR/node_modules"
rm -rf "$KNEX_TMP"
echo -e "\033[32m[deploy] knex-dm 运行时依赖安装完成!\033[0m"

# ── Channel plugin runtime: pnpm deploy --prod ──────────────────────────────
# compat-deploy 放在 dist/_compat-deploy/ 内，确保随 dist 缓存一起被 deploy 阶段恢复
COMPAT_DEPLOY_DIR="packages/nextclaw-digital-employee/dist/_compat-deploy"

# 清理旧产物，避免残留依赖造成运行时模块解析异常
rm -rf "$COMPAT_DEPLOY_DIR"

echo -e "\033[34m[deploy] 生成 openclaw-compat 生产依赖包...\033[0m"
pnpm --filter @nextclaw/openclaw-compat deploy --prod "$COMPAT_DEPLOY_DIR"
if [ $? -ne 0 ]; then
  echo -e "\033[31m[deploy] pnpm deploy 失败!\033[0m"
  exit 1
fi

# Add channel plugin packages (loaded by jiti at runtime, not in openclaw-compat's deps)
echo -e "\033[34m[deploy] 拷贝 channel plugin 包...\033[0m"
for pkg in dingtalk discord email feishu mochat qq slack telegram wecom whatsapp; do
  src="packages/extensions/nextclaw-channel-plugin-$pkg"
  dest="$COMPAT_DEPLOY_DIR/node_modules/@nextclaw/channel-plugin-$pkg"
  if [ -d "$src" ]; then
    cp -r "$src" "$dest"
    echo "  copied $src -> $dest"
  fi
done

# Add workspace packages that channel plugins import (dist only, no src)
echo -e "\033[34m[deploy] 拷贝 workspace 公共包 (dist only)...\033[0m"
for pair in "packages/nextclaw-core:core" "packages/extensions/nextclaw-channel-runtime:channel-runtime"; do
  src="${pair%%:*}"
  name="${pair##*:}"
  dest="$COMPAT_DEPLOY_DIR/node_modules/@nextclaw/$name"
  mkdir -p "$dest"
  cp "$src/package.json" "$dest/"
  if [ -d "$src/dist" ]; then
    cp -r "$src/dist" "$dest/dist"
    echo "  copied $src/dist -> $dest/dist"
  fi
done

echo -e "\033[32m[deploy] channel plugin runtime 构建完成!\033[0m"
