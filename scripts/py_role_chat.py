#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
在本地通过后端 HTTP API 与 LobeChat 的“角色”进行对话的 Python 客户端。
- 不需要数据库；会话上下文仅保存在 Python 进程内存中。
- 鉴权请求头与前端一致，采用 XOR + Base64 混淆方案。

使用示例（Windows PowerShell）：
  $env:OPENAI_API_KEY="<你的 Key>"; $env:OPENAI_PROXY_URL="https://api.uniapi.io/v1"; \
    python scripts/py_role_chat.py --role "张三" --msg "你好"

交互式会话（流式输出）：
  python scripts/py_role_chat.py --role "张三"
  > 你好
  ... 流式回复 ...
  > 继续
  ...
  > exit
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from typing import Any, Dict, List, Optional

import requests

SECRET_XOR_KEY = "LobeHub · LobeHub"
DEFAULT_BASE_URL = "http://localhost:3020"
DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-5-mini"


# -------------------- 自动加载 .env.local -------------------- #
def _parse_and_set_env(env_path: str) -> None:
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.lower().startswith("export "):
                    line = line[7:].strip()
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                # 如果值被引号包裹，则去掉首尾引号
                if (val.startswith("\"") and val.endswith("\"")) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                # 如环境变量已存在则不覆盖
                if key and (key not in os.environ or not os.environ.get(key)):
                    os.environ[key] = val
    except FileNotFoundError:
        pass


def _seek_file_upwards(start_dir: str, filename: str) -> Optional[str]:
    cur = os.path.abspath(start_dir)
    last = None
    while cur and cur != last:
        candidate = os.path.join(cur, filename)
        if os.path.isfile(candidate):
            return candidate
        last = cur
        cur = os.path.dirname(cur)
    return None


def load_env_from_dotenv(filenames=(".env.local", ".env")) -> None:
    # 先从当前工作目录尝试，再从脚本目录开始，逐级向上查找
    bases = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    seen = set()
    for base in bases:
        for name in filenames:
            key = (base, name)
            if key in seen:
                continue
            seen.add(key)
            found = _seek_file_upwards(base, name)
            if found:
                _parse_and_set_env(found)

# -------------------- 鉴权令牌（XOR + Base64） -------------------- #
def _xor_obfuscate(data: bytes, key: bytes) -> bytes:
    res = bytearray(len(data))
    klen = len(key)
    for i, b in enumerate(data):
        res[i] = b ^ key[i % klen]
    return bytes(res)


def build_auth_header(user_id: str) -> Dict[str, str]:
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_PROXY_URL")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in environment")
    # base_url is optional for pure OpenAI; for UniAPI/compatible endpoint it's required
    payload = {
        "userId": user_id,
        "apiKey": api_key,
        "baseURL": base_url,
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    token_bytes = _xor_obfuscate(raw, SECRET_XOR_KEY.encode("utf-8"))
    token = base64.b64encode(token_bytes).decode("ascii")
    return {"X-lobe-chat-auth": token}


# -------------------- 角色辅助方法 -------------------- #
def fetch_roles(base_url: str) -> List[Dict[str, Any]]:
    url = f"{base_url}/webapi/roles"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []


def find_role_by_name(roles: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    # exact match first
    for r in roles:
        if str(r.get("name", "")) == name:
            return r
    # case-insensitive fallback
    for r in roles:
        if str(r.get("name", "")).lower() == name.lower():
            return r
    return None


def build_system_prompt(role: Dict[str, Any]) -> str:
    parts: List[str] = []
    desc = role.get("description")
    if desc:
        parts.append(str(desc))
    personality = role.get("personality")
    if personality is not None:
        try:
            parts.append(json.dumps(personality, ensure_ascii=False))
        except Exception:
            parts.append(str(personality))
    return "\n".join([p for p in parts if p])


# -------------------- 聊天客户端 -------------------- #
class RoleChatClient:
    def __init__(self, base_url: str, provider: str, model: str, user_id: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.provider = provider
        self.model = model
        self.user_id = user_id
        self.headers = {
            **build_auth_header(user_id),
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            # 可选：你可以根据需要添加链路追踪等额外请求头
        }
        self.roles_cache: Optional[List[Dict[str, Any]]] = None
        self.system_prompt: Optional[str] = None
        self.history: List[Dict[str, Any]] = []  # OpenAI-style messages without system

    def list_models(self, provider: Optional[str] = None) -> List[Dict[str, Any]]:
        prov = (provider or self.provider).strip()
        url = f"{self.base_url}/webapi/models/{prov}"
        # 使用 JSON Accept 以获取列表
        headers = dict(self.headers)
        headers["Accept"] = "application/json"
        r = requests.get(url, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return []

    def _ensure_role(self, role_name: str) -> None:
        if self.roles_cache is None:
            self.roles_cache = fetch_roles(self.base_url)
        role = find_role_by_name(self.roles_cache, role_name)
        if not role:
            raise RuntimeError(f"Role not found: {role_name}")
        self.system_prompt = build_system_prompt(role)

    def _chat_endpoint(self) -> str:
        return f"{self.base_url}/webapi/chat/{self.provider}"

    def send(self, role_name: str, user_text: str, stream: bool = True) -> str:
        """发送一条消息并返回助手的完整回复（stream=True 时会打印流式片段）。"""
        self._ensure_role(role_name)

        messages: List[Dict[str, Any]] = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.extend(self.history)
        messages.append({"role": "user", "content": user_text})

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
        }

        full_reply = []
        with requests.post(self._chat_endpoint(), data=json.dumps(payload), headers=self.headers, timeout=600, stream=stream) as resp:
            if resp.status_code >= 400:
                # Try to show detailed provider error
                err_text = None
                try:
                    err_text = resp.text
                    err_json = json.loads(err_text)
                    # Common shape: { errorType, body: { error, provider, ... } }
                    raise RuntimeError(f"HTTP {resp.status_code} | {err_json}")
                except json.JSONDecodeError:
                    raise RuntimeError(f"HTTP {resp.status_code} | {err_text}")

            if stream:
                for raw_line in resp.iter_lines(decode_unicode=False):
                    if not raw_line:
                        continue
                    try:
                        line = raw_line.decode("utf-8", errors="replace").strip()
                    except Exception:
                        line = raw_line.decode(errors="replace").strip()
                    if not line or line.startswith(":"):
                        continue
                    # 只处理 data: 行；跳过 id/event
                    if not line.lower().startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    # 尝试解析 JSON 块，否则按纯文本处理
                    chunk_text = ""
                    try:
                        if data.startswith("{") or data.startswith("["):
                            obj = json.loads(data)
                            if isinstance(obj, dict):
                                chunk_text = obj.get("content") or obj.get("delta") or obj.get("text") or ""
                                if not chunk_text:
                                    choices = obj.get("choices")
                                    if isinstance(choices, list) and choices:
                                        first = choices[0]
                                        if isinstance(first, dict):
                                            delta = first.get("delta")
                                            if isinstance(delta, dict):
                                                chunk_text = delta.get("content") or ""
                        else:
                            # 也可能是 JSON 字符串，比如 "你好"
                            try:
                                s = json.loads(data)
                                if isinstance(s, str):
                                    chunk_text = s
                            except Exception:
                                chunk_text = data
                    except Exception:
                        chunk_text = data
                    if not chunk_text:
                        continue
                    sys.stdout.write(chunk_text)
                    sys.stdout.flush()
                    full_reply.append(chunk_text)
                print()  # 流结束后换行
            else:
                # non-stream: read once; provider formats may vary
                text = resp.text or ""
                try:
                    obj = json.loads(text)
                    text = obj.get("content") or obj.get("delta") or text
                except Exception:
                    pass
                print(text)
                full_reply.append(text)

        # 更新历史
        self.history.append({"role": "user", "content": user_text})
        assistant_text = "".join(full_reply)
        self.history.append({"role": "assistant", "content": assistant_text})
        return assistant_text


# -------------------- 命令行 CLI -------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(description="Chat with a LobeChat role from Python")
    parser.add_argument("--base", default=DEFAULT_BASE_URL, help="LobeChat base URL, e.g., http://localhost:3010")
    parser.add_argument("--role", required=False, help="Role name (must exist in roles.json)")
    parser.add_argument("--msg", help="Send one-shot message and exit (otherwise interactive)")
    parser.add_argument("--user", default="PY_USER", help="User ID for auth payload")
    parser.add_argument("--provider", default=DEFAULT_PROVIDER, help="Provider, default: openai")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model, default: gpt-5-mini")
    parser.add_argument("--no-stream", action="store_true", help="Disable streaming")
    parser.add_argument("--list-models", action="store_true", help="List available models for current provider and exit")

    args = parser.parse_args()

    # 自动从 .env.local / .env 加载 OPENAI_*（若未在环境中设置）
    load_env_from_dotenv()

    client = RoleChatClient(base_url=args.base, provider=args.provider, model=args.model, user_id=args.user)

    if args.list_models:
        try:
            models = client.list_models()
            # Try to print id/name fields
            names: List[str] = []
            for m in models:
                if isinstance(m, dict):
                    name = m.get("id") or m.get("name") or m.get("model")
                    if name:
                        names.append(str(name))
            if names:
                print("\n".join(names))
            else:
                # fallback: print raw
                print(json.dumps(models, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"[error] list models failed: {e}")
        return

    if not args.role:
        print("[error] --role is required unless --list-models is used")
        return

    if args.msg:
        client.send(args.role, args.msg, stream=not args.no_stream)
        return

    # Interactive loop
    print(f"[py-role-chat] Role: {args.role} | Provider: {args.provider} | Model: {args.model}")
    print("Commands: /model <name>, /provider <name>, /models, /help, /exit")
    while True:
        try:
            user_text = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user_text:
            continue
        if user_text.startswith("/"):
            parts = user_text[1:].split(None, 1)
            cmd = parts[0].lower() if parts else ""
            arg = parts[1].strip() if len(parts) > 1 else ""
            if cmd in {"exit", "quit"}:
                break
            if cmd == "help":
                print("Available commands: /model <name>, /provider <name>, /models, /exit")
                continue
            if cmd == "model":
                if arg:
                    client.model = arg
                    print(f"[set] model -> {client.model}")
                else:
                    print(f"[current] model = {client.model} | usage: /model <name>")
                continue
            if cmd == "provider":
                if arg:
                    client.provider = arg
                    print(f"[set] provider -> {client.provider}")
                else:
                    print(f"[current] provider = {client.provider} | usage: /provider <name>")
                continue
            if cmd == "models":
                try:
                    models = client.list_models()
                    names = []
                    for m in models:
                        if isinstance(m, dict):
                            nm = m.get("id") or m.get("name") or m.get("model")
                            if nm:
                                names.append(str(nm))
                    if names:
                        print("\n".join(names))
                    else:
                        print(json.dumps(models, ensure_ascii=False, indent=2))
                except Exception as e:
                    print(f"[error] list models failed: {e}")
                continue
            print(f"[warn] unknown command: /{cmd}")
            continue
        try:
            client.send(args.role, user_text, stream=not args.no_stream)
        except Exception as e:
            print(f"[error] {e}")


if __name__ == "__main__":
    main()

