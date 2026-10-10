#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
用法:
  bash backend/scripts/generate-secrets.sh development
  bash backend/scripts/generate-secrets.sh production
  bash backend/scripts/generate-secrets.sh production --force

说明:
  development  更新 backend/.env 和 captcha-service/.env
  production   更新 backend/.env.production 和 captcha-service/.env.production
  默认只填充空值或示例占位值；--force 会轮换所有受管密钥和初始密码。
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

environment="$1"
force="false"
if [[ "${2:-}" == "--force" ]]; then
  force="true"
elif [[ $# -eq 2 ]]; then
  usage >&2
  exit 1
fi

if [[ "$environment" != "development" && "$environment" != "production" ]]; then
  echo "错误：环境必须是 development 或 production" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "错误：未找到 openssl，请先安装 OpenSSL" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

if [[ "$environment" == "development" ]]; then
  backend_env="$project_root/backend/.env"
  captcha_env="$project_root/captcha-service/.env"
else
  backend_env="$project_root/backend/.env.production"
  captcha_env="$project_root/captcha-service/.env.production"
fi

for env_file in "$backend_env" "$captcha_env"; do
  if [[ ! -f "$env_file" ]]; then
    echo "错误：配置文件不存在：$env_file" >&2
    exit 1
  fi
  if [[ ! -w "$env_file" ]]; then
    echo "错误：配置文件不可写：$env_file" >&2
    exit 1
  fi
done

tmp_files=()
cleanup() {
  for tmp_file in "${tmp_files[@]}"; do
    [[ -e "$tmp_file" ]] && rm -f "$tmp_file"
  done
}
trap cleanup EXIT

random_hex() {
  openssl rand -hex 32
}

random_mfa_key() {
  openssl rand 32 | base64 | tr -d '\n'
  printf '\n'
}

random_password() {
  openssl rand -base64 24
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == replace-with-* || "$value" == change-this-* || "$value" == 请替换* || "$value" == \<*\> || "$value" == 同一组* || "$value" == 同一组随机密钥 || "$value" == 同一组独立的日志哈希密钥 || "$value" == admin@123456 || "$value" == security@123456 || "$value" == swagger@123456 ]]
}

set_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp "${env_file}.tmp.XXXXXX")"
  tmp_files+=("$tmp_file")

  awk -v key="$key" -v value="$value" -v force="$force" '
    function should_replace(old_value) {
      return force == "true" || old_value == "" || old_value ~ /^replace-with/ || old_value ~ /^change-this/ || old_value ~ /请替换/ || old_value ~ /^同一组/ || old_value ~ /^另一组/ || old_value == "admin@123456" || old_value == "security@123456" || old_value == "swagger@123456" || old_value ~ /^</
    }
    BEGIN { found = 0 }
    $0 ~ "^[[:space:]]*" key "=" {
      found = 1
      old_value = substr($0, index($0, "=") + 1)
      if (should_replace(old_value)) print key "=" value
      else print $0
      next
    }
    { print $0 }
    END {
      if (!found) print key "=" value
    }
  ' "$env_file" > "$tmp_file"

  chmod 600 "$tmp_file"
  mv "$tmp_file" "$env_file"
  tmp_files=()
}

get_env_value() {
  local env_file="$1"
  local key="$2"
  awk -v key="$key" '$0 ~ "^[[:space:]]*" key "=" { print substr($0, index($0, "=") + 1); exit }' "$env_file"
}

captcha_service_secret="$(random_hex)"
captcha_log_hash_secret="$(random_hex)"
audit_integrity_secret="$(random_hex)"
ops_execution_signing_secret="$(random_hex)"
mfa_encryption_key="$(random_mfa_key)"
seed_security_password="$(random_password)"
seed_security_password_2="$(random_password)"
seed_system_password="$(random_password)"
seed_audit_password="$(random_password)"
swagger_admin_password="$(random_password)"

# 非强制模式下复用已有有效的共享密钥，避免 backend 与 captcha-service 不一致。
if [[ "$force" != "true" ]]; then
  existing_value="$(get_env_value "$backend_env" CAPTCHA_SERVICE_SECRET)"
  if ! is_placeholder "$existing_value"; then
    captcha_service_secret="$existing_value"
  else
    existing_value="$(get_env_value "$captcha_env" CAPTCHA_SERVICE_SECRET)"
    if ! is_placeholder "$existing_value"; then captcha_service_secret="$existing_value"; fi
  fi

  existing_value="$(get_env_value "$backend_env" CAPTCHA_LOG_HASH_SECRET)"
  if ! is_placeholder "$existing_value"; then
    captcha_log_hash_secret="$existing_value"
  else
    existing_value="$(get_env_value "$captcha_env" CAPTCHA_LOG_HASH_SECRET)"
    if ! is_placeholder "$existing_value"; then captcha_log_hash_secret="$existing_value"; fi
  fi
fi

# backend 和 captcha-service 必须使用同一组验证码密钥。
set_env_value "$backend_env" CAPTCHA_SERVICE_SECRET "$captcha_service_secret"
set_env_value "$captcha_env" CAPTCHA_SERVICE_SECRET "$captcha_service_secret"
set_env_value "$backend_env" CAPTCHA_LOG_HASH_SECRET "$captcha_log_hash_secret"
set_env_value "$captcha_env" CAPTCHA_LOG_HASH_SECRET "$captcha_log_hash_secret"

set_env_value "$backend_env" AUDIT_INTEGRITY_SECRET "$audit_integrity_secret"
set_env_value "$backend_env" OPS_EXECUTION_SIGNING_SECRET "$ops_execution_signing_secret"
set_env_value "$backend_env" MFA_ENCRYPTION_KEY "$mfa_encryption_key"
set_env_value "$backend_env" SEED_SECURITY_PASSWORD "$seed_security_password"
set_env_value "$backend_env" SEED_SECURITY_PASSWORD_2 "$seed_security_password_2"
set_env_value "$backend_env" SEED_SYSTEM_PASSWORD "$seed_system_password"
set_env_value "$backend_env" SEED_AUDIT_PASSWORD "$seed_audit_password"
set_env_value "$backend_env" SWAGGER_ADMIN_PASSWORD "$swagger_admin_password"

echo "已生成并写入 $environment 环境密钥："
echo "  $backend_env"
echo "  $captcha_env"
if [[ "$force" == "true" ]]; then
  echo "注意：已使用 --force 轮换所有受管密钥和初始密码，请重启相关服务并执行密钥轮换记录。"
else
  echo "说明：已有有效密钥保持不变；空值或示例占位值已生成并填充。"
fi
echo "请勿提交上述 .env 文件，也不要在日志、工单或聊天中复制密钥。"
