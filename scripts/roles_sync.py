#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
声明式同步脚本（模式 A）：
- 以 JSON（默认 src/storage/roles.json）作为“期望状态”的唯一事实源
- 同步规则：按 name 为主键，创建缺失项、对比差异再更新；不删除多余项（无 prune）
- personality：按 name 稳定随机生成，避免多次运行产生抖动
- open：可选参数，同步完成后按名称打开会话（若不存在将先创建再打开）

环境变量：
- LOBECHAT_BASE：后端地址（默认 http://localhost:3020）

示例：
- python scripts/roles_sync.py                      # 仅同步
- python scripts/roles_sync.py --open 张三 李四     # 同步后打开多个角色
- python scripts/roles_sync.py --file path/to.json  # 使用自定义 JSON 文件
"""
from __future__ import annotations

import json
import os
import sys
import hashlib
import random
import urllib.request
import urllib.error
import webbrowser
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

# ======================= 基本配置 ======================= #
BASE = os.environ.get("LOBECHAT_BASE", "http://localhost:3020").rstrip("/")
DEFAULT_FILE = "src/storage/roles.json"
TIMEOUT = 15
OPEN_BROWSER_DEFAULT = True
# ====================================================== #


# ------------------ HTTP/数据结构 ------------------ #
@dataclass
class Role:
    role_id: int
    name: str
    description: str | None = None
    personality: Any | None = None


def _request(method: str, path: str, data: Dict[str, Any] | None = None) -> Tuple[int, Any]:
    url = BASE + path
    req = urllib.request.Request(url=url, method=method)
    req.add_header("Accept", "application/json")
    body = None
    if data is not None:
        req.add_header("Content-Type", "application/json")
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    try:
        with urllib.request.urlopen(req, data=body, timeout=TIMEOUT) as resp:
            status = resp.status
            raw = resp.read()
            text = raw.decode("utf-8", errors="replace")
            try:
                payload = json.loads(text)
            except Exception:
                payload = text
            return status, payload
    except urllib.error.HTTPError as e:
        try:
            err_text = e.read().decode("utf-8", errors="replace")
            err_json = json.loads(err_text)
        except Exception:
            err_json = {"error": str(e)}
        return e.code, err_json
    except urllib.error.URLError as e:
        return 0, {"error": f"连接失败: {e}"}


def _fetch_all_roles() -> List[Role]:
    st, payload = _request("GET", "/webapi/roles")
    if st != 200 or not isinstance(payload, list):
        print(json.dumps({"error": f"拉取现有角色失败(status={st})"}, ensure_ascii=False), file=sys.stderr)
        return []
    roles: List[Role] = []
    for it in payload:
        try:
            rid = int(it.get("role_id"))
            roles.append(Role(role_id=rid, name=str(it.get("name")), description=it.get("description"), personality=it.get("personality")))
        except Exception:
            continue
    return roles


def _index_by_name(roles: List[Role]) -> Dict[str, Role]:
    idx: Dict[str, Role] = {}
    for r in roles:
        if r.name in idx:
            raise RuntimeError(f"服务端存在重名: {r.name}")
        idx[r.name] = r
    return idx


# ------------------ personality（按 name 稳定随机） ------------------ #
STYLES = ["concise", "friendly", "formal", "humorous", "analytical"]
TONES = ["neutral", "positive", "curious", "confident", "warm"]
EXPERTISE = ["general", "customer_support", "education", "finance", "coding", "health"]
TRAITS = ["patient", "creative", "precise", "curious", "efficient", "empathetic"]


def _seed_from_name(name: str) -> int:
    h = hashlib.sha256(name.encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big")


def generate_personality(name: str) -> Dict[str, Any]:
    rnd = random.Random(_seed_from_name(name))
    return {
        "style": rnd.choice(STYLES),
        "tone": rnd.choice(TONES),
        "traits": rnd.sample(TRAITS, k=2),
        "expertise": rnd.choice(EXPERTISE),
    }


# ------------------ JSON 读取与校验 ------------------ #

def load_desired(file_path: str) -> List[Dict[str, str]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise RuntimeError(f"读取 JSON 失败: {file_path} ({e})")

    if not isinstance(data, list):
        raise RuntimeError("JSON 顶层必须是数组")

    seen = set()
    items: List[Dict[str, str]] = []
    for i, it in enumerate(data, 1):
        if not isinstance(it, dict):
            raise RuntimeError(f"第 {i} 个条目不是对象")
        name = str(it.get("name", "")).strip()
        if not name:
            raise RuntimeError(f"第 {i} 个条目缺少 name")
        if name in seen:
            raise RuntimeError(f"JSON 中存在重名: {name}")
        seen.add(name)
        desc = it.get("description")
        items.append({"name": name, "description": desc if isinstance(desc, str) else ""})
    return items


# ------------------ 同步逻辑 ------------------ #

def ensure_role(idx: Dict[str, Role], name: str, description: str | None) -> Role:
    if name in idx:
        return idx[name]
    payload = {"name": name, "description": description or "", "personality": generate_personality(name)}
    st, res = _request("POST", "/webapi/roles", payload)
    if st not in (200, 201) or not isinstance(res, dict):
        raise RuntimeError(f"创建失败 {name}: {res}")
    role = Role(role_id=int(res.get("role_id")), name=res.get("name"), description=res.get("description"), personality=res.get("personality"))
    idx[name] = role
    print(f"已创建: {role.name} (role_id={role.role_id})")
    return role


def upsert_role(idx: Dict[str, Role], name: str, description: str | None) -> Role:
    # 不存在则创建；存在则仅在有差异时更新
    if name not in idx:
        return ensure_role(idx, name, description)

    role = idx[name]
    desired_desc = description or ""
    desired_persona = generate_personality(name)

    need_update = (role.description or "") != desired_desc or (role.personality or {}) != desired_persona
    if not need_update:
        print(f"无需更新: {name}")
        return role

    patch = {"description": desired_desc, "personality": desired_persona}
    st, res = _request("PUT", f"/webapi/roles/{role.role_id}", patch)
    if st != 200 or not isinstance(res, dict):
        raise RuntimeError(f"更新失败 {name}: {res}")
    new_role = Role(role_id=int(res.get("role_id")), name=res.get("name"), description=res.get("description"), personality=res.get("personality"))
    idx[name] = new_role
    print(f"已更新: {new_role.name} (role_id={new_role.role_id})")
    return new_role


def open_role(idx: Dict[str, Role], name: str, desc_hint: str | None, open_browser: bool = True) -> None:
    # 不存在则先创建再打开
    role = ensure_role(idx, name, desc_hint or "由 roles_sync 自动创建")
    st, res = _request("GET", f"/webapi/roles/{role.role_id}/open")
    if st != 200 or not isinstance(res, dict):
        raise RuntimeError(f"打开失败 {name}: {res}")
    url_path = res.get("url", "/chat")
    full = BASE + url_path
    print(json.dumps({"open": {"name": name, "role_id": role.role_id, "url": full}}, ensure_ascii=False))
    if open_browser:
        webbrowser.open(full)


# ------------------ CLI ------------------ #

def parse_argv(argv: List[str]) -> Dict[str, Any]:
    # 极简解析，避免引入 argparse 依赖
    file_path = DEFAULT_FILE
    open_names: List[str] = []
    open_browser = OPEN_BROWSER_DEFAULT

    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--file" and i + 1 < len(argv):
            file_path = argv[i + 1]
            i += 2
            continue
        if a == "--open":
            # 其后所有参数都视为待打开的 name
            open_names = argv[i + 1 :]
            break
        if a == "--no-open-browser":
            open_browser = False
            i += 1
            continue
        i += 1

    return {"file": file_path, "open": open_names, "open_browser": open_browser}


def main() -> int:
    try:
        args = parse_argv(sys.argv[1:])
        desired = load_desired(args["file"])
        remote_roles = _fetch_all_roles()
        idx = _index_by_name(remote_roles)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1

    created, updated = [], []

    for item in desired:
        name = item["name"]
        desc = item.get("description")
        # upsert
        before = idx.get(name)
        r = upsert_role(idx, name, desc)
        if before is None:
            created.append({"name": r.name, "role_id": r.role_id})
        elif (before.description or "") != (r.description or "") or (before.personality or {}) != (r.personality or {}):
            updated.append({"name": r.name, "role_id": r.role_id})

    # open
    for name in args["open"]:
        try:
            open_role(idx, name, None, open_browser=args["open_browser"])
        except Exception as e:
            print(json.dumps({"open_error": {"name": name, "error": str(e)}}, ensure_ascii=False), file=sys.stderr)

    summary = {
        "base": BASE,
        "file": args["file"],
        "created": created,
        "updated": updated,
        "opened": args["open"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())


