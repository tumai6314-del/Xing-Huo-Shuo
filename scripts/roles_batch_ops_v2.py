#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量角色操作（单文件清单）：
- 在本脚本顶部直接填写 CREATE / UPDATE / DELETE / OPEN 四个列表（仅需 name、description）
- 运行后脚本会调用本地 LobeChat Web API 执行对应操作
- role_id 始终由服务端分配；name 作为唯一主键
- personality 在创建/更新时按 name 稳定随机生成（多次运行不抖动）
- OPEN 会在浏览器打开该角色对话；若角色不存在则先创建再打开

环境变量：
- LOBECHAT_BASE：后端地址（默认 http://localhost:3010）

用法：
- 直接运行：python scripts/roles_batch_ops_v2.py
- 如需修改后端地址（PowerShell）：$env:LOBECHAT_BASE="http://localhost:3010"
"""
from __future__ import annotations

import json
import os
import sys
import random
import hashlib
import urllib.request
import urllib.error
import webbrowser
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

# ======================= 基本配置（在此处编辑） ======================= #
BASE = os.environ.get("LOBECHAT_BASE", "http://localhost:3020").rstrip("/")
OPEN_BROWSER = True  # 处理 OPEN 列表时是否自动打开浏览器
TIMEOUT = 15

# 在下方四个列表中填写你的批量操作数据（仅需 name 与 description）
# 示例：
# CREATE = [
#   {"name": "张三", "description": "A friendly AI assistant"},
#   {"name": "李四", "description": "A customer support bot"},
# ]
# UPDATE = [
#   {"name": "王五", "description": "An assistant for data analysis"},
# ]
# DELETE = ["赵六"]
# OPEN   = ["张三", "李四"]
CREATE: List[Dict[str, str]] = []
UPDATE: List[Dict[str, str]] = []
DELETE: List[str] = []
OPEN: List[str] = []
# ================================================================= #


# ------------------ 数据结构与 HTTP ------------------ #
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
            # 强制校验 name 唯一性，避免歧义
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


# ------------------ 基础操作 ------------------ #

def create_role_if_absent(idx: Dict[str, Role], name: str, description: str | None) -> Role:
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


def update_role(idx: Dict[str, Role], name: str, description: str | None) -> Role:
    if name not in idx:
        raise RuntimeError(f"更新失败：未找到角色 '{name}'")
    role = idx[name]
    patch = {"description": description or role.description, "personality": generate_personality(name)}
    st, res = _request("PUT", f"/webapi/roles/{role.role_id}", patch)
    if st != 200 or not isinstance(res, dict):
        raise RuntimeError(f"更新失败 {name}: {res}")
    new_role = Role(role_id=int(res.get("role_id")), name=res.get("name"), description=res.get("description"), personality=res.get("personality"))
    idx[name] = new_role
    print(f"已更新: {new_role.name} (role_id={new_role.role_id})")
    return new_role


def delete_role(idx: Dict[str, Role], name: str) -> None:
    if name not in idx:
        print(f"跳过删除：未找到 '{name}'")
        return
    role_id = idx[name].role_id
    st, res = _request("DELETE", f"/webapi/roles/{role_id}")
    if st != 200:
        raise RuntimeError(f"删除失败 {name}: {res}")
    print(f"已删除: {name} (role_id={role_id})")
    del idx[name]


def open_role(idx: Dict[str, Role], name: str, description_hint: str | None) -> None:
    # 确保存在（不存在则先创建）
    if name not in idx:
        role = create_role_if_absent(idx, name, description_hint or "由 roles_batch_ops 自动创建")
    else:
        role = idx[name]
    st, res = _request("GET", f"/webapi/roles/{role.role_id}/open")
    if st != 200 or not isinstance(res, dict):
        raise RuntimeError(f"Open failed for {name}: {res}")
    url_path = res.get("url", "/chat")
    full = BASE + url_path
    print(json.dumps({"open": {"name": name, "role_id": role.role_id, "url": full}}, ensure_ascii=False))
    if OPEN_BROWSER:
        webbrowser.open(full)


# ------------------ 主流程 ------------------ #

def main() -> int:
    try:
        roles = _fetch_all_roles()
        idx = _index_by_name(roles)
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1

    created, updated, deleted, opened = [], [], [], []

    # 1) CREATE
    for item in CREATE:
        name = str(item.get("name", "")).strip()
        if not name:
            print("跳过创建：name 为空", file=sys.stderr)
            continue
        desc = item.get("description")
        try:
            r = create_role_if_absent(idx, name, desc)
            created.append({"name": r.name, "role_id": r.role_id})
        except Exception as e:
            print(json.dumps({"create_error": {"name": name, "error": str(e)}}, ensure_ascii=False), file=sys.stderr)

    # 2) UPDATE
    for item in UPDATE:
        name = str(item.get("name", "")).strip()
        if not name:
            print("跳过更新：name 为空", file=sys.stderr)
            continue
        desc = item.get("description")
        try:
            r = update_role(idx, name, desc)
            updated.append({"name": r.name, "role_id": r.role_id})
        except Exception as e:
            print(json.dumps({"update_error": {"name": name, "error": str(e)}}, ensure_ascii=False), file=sys.stderr)

    # 3) DELETE
    for name in DELETE:
        name = str(name).strip()
        if not name:
            print("跳过删除：name 为空", file=sys.stderr)
            continue
        try:
            delete_role(idx, name)
            deleted.append(name)
        except Exception as e:
            print(json.dumps({"delete_error": {"name": name, "error": str(e)}}, ensure_ascii=False), file=sys.stderr)

    # 4) OPEN
    for name in OPEN:
        name = str(name).strip()
        if not name:
            print("跳过打开：name 为空", file=sys.stderr)
            continue
        try:
            desc_hint = None
            open_role(idx, name, desc_hint)
            opened.append(name)
        except Exception as e:
            print(json.dumps({"open_error": {"name": name, "error": str(e)}}, ensure_ascii=False), file=sys.stderr)

    # 汇总输出
    summary = {
        "base": BASE,
        "created": created,
        "updated": updated,
        "deleted": deleted,
        "opened": opened,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

