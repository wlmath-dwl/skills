#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据 trace_id 查询测试环境日志
"""

import base64
import hashlib
import hmac
import random
import time
import urllib.parse
import requests
from requests.auth import AuthBase
import json
import sys
import argparse

AK = "n1uNK5bcmZboJYX1tLRQPuigK2X9fGZa"
SK = "GU9d66RJcnbMhtN5FLCuamqY5pBiU7Uu"
URL = "http://api.vr-scheduler.realsee.com/o11y-center/v1/log/search"


class VRSchedulerAuth(AuthBase):
    def __init__(self, access_key_id: str, access_key_secret: str):
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret

    def get_canonicalize_headers(self, request) -> str:
        canonicalize_headers = [
            (k.lower().strip(), str(v).strip())
            for k, v in request.headers.items()
            if k.lower().startswith('x-vr-scheduler')
        ]
        canonicalize_headers.sort(key=lambda x: x[0])
        return '\n'.join([f'{k}:{v}' for k, v in canonicalize_headers])

    @staticmethod
    def get_canonicalize_resource(request) -> str:
        request_uri = urllib.parse.urlparse(request.url).path
        canonicalize_resource = urllib.parse.parse_qsl(urllib.parse.urlparse(request.url).query, keep_blank_values=True)
        canonicalize_resource.sort(key=lambda x: (x[0], x[1]))
        if len(canonicalize_resource) > 0:
            return request_uri + '?' + '&'.join([f'{k}={v}' for k, v in canonicalize_resource])
        else:
            return request_uri

    def get_signature(self, request) -> str:
        canonicalize_headers: str = self.get_canonicalize_headers(request)
        canonicalize_resource: str = self.get_canonicalize_resource(request)

        string_to_sign = '\n'.join(
            [
                request.method.upper(),
                request.headers.get('accept', ''),
                request.headers.get('content-md5', ''),
                request.headers.get('content-type', ''),
                request.headers.get('date', ''),
                canonicalize_headers,
                canonicalize_resource,
            ]
        )

        signature = base64.b64encode(
            hmac.new(
                key=self.access_key_secret.encode('utf-8'), msg=string_to_sign.encode('utf-8'), digestmod=hashlib.sha1
            ).digest()
        ).decode()
        return signature

    def __call__(self, r):
        r.headers.update(
            {
                'date': time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime()),
                'x-vr-scheduler-signature-nonce': random.randint(2**40, 2**50),
                'x-vr-scheduler-signature-timestamp': int(time.time()),
                'x-vr-scheduler-signature-method': 'HMAC-SHA1',
            }
        )
        r.headers['Authorization'] = f'HMAC-SHA1 {self.access_key_id}:{self.get_signature(r)}'
        return r


def search_logs(trace_id: str, start_time: int = None, end_time: int = None, page: int = 1, page_size: int = 100) -> dict:
    """查询日志，start_time 和 end_time 单位为秒"""
    now = int(time.time())
    if start_time is None:
        start_time = now - 3600 * 24  # 默认过去24小时
    if end_time is None:
        end_time = now

    sess = requests.Session()
    sess.auth = VRSchedulerAuth(AK, SK)

    payload = {
        "log_project": "test-tke-inf-1",
        "log_store": "test-cube-app-logs",
        "query": f"trace_id:{trace_id}",
        "start_time": start_time,
        "end_time": end_time,
        "page": page,
        "page_size": page_size
    }

    response = sess.post(URL, json=payload)
    return response.json()


def deep_parse_json(obj):
    """递归解析所有嵌套的 JSON 字符串"""
    if isinstance(obj, str):
        try:
            parsed = json.loads(obj)
            return deep_parse_json(parsed)
        except (json.JSONDecodeError, ValueError):
            return obj
    elif isinstance(obj, dict):
        return {k: deep_parse_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [deep_parse_json(item) for item in obj]
    return obj


def try_parse_json(s: str):
    """尝试解析 JSON，尽可能处理各种转义情况"""
    if not s:
        return None

    # 尝试直接解析
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # 尝试去除一层转义后解析
    try:
        # 处理 \" 转义
        normalized = s.replace('\\"', '"')
        return json.loads(normalized)
    except json.JSONDecodeError:
        pass

    # 无法解析，返回 None
    return None


def format_logs(logs_data: dict) -> str:
    """格式化日志输出，返回原始日志内容"""
    # 检查是否有错误信息
    if logs_data.get("message"):
        return f"查询失败: {logs_data.get('message')}"

    items = logs_data.get("data", {}).get("items", [])
    if not items:
        return "未找到相关日志"

    output = []
    total = logs_data.get("data", {}).get("total", 0)
    output.append(f"## 查询结果")
    output.append(f"**日志数量**: {total} 条")
    output.append("")

    for i, log in enumerate(items, 1):
        timestamp = log.get("log_time", "") or log.get("@timestamp", "")
        level = log.get("level", "")
        app_name = log.get("app_name", "")
        uri = log.get("uri", "")
        log_type = log.get("log_type", "")

        output.append(f"### {i}. [{timestamp}] [{level}] [{app_name}] [{uri}] [{log_type}]")

        # 解析 context 字段中的 JSON
        context = log.get("context", "")
        if context:
            parsed = try_parse_json(context)
            if parsed:
                # 递归解析嵌套的 JSON 字符串
                parsed = deep_parse_json(parsed)
                output.append("```json")
                output.append(json.dumps(parsed, indent=2, ensure_ascii=False))
                output.append("```")
            else:
                # 无法解析，显示原始内容（先去除转义）
                normalized = context.replace('\\"', '"')
                output.append("```")
                output.append(normalized)
                output.append("```")

        # 解析 extra 字段中的 JSON
        extra = log.get("extra", "")
        if extra:
            try:
                extra_json = json.loads(extra)
                extra_json = deep_parse_json(extra_json)
                output.append("**extra:**")
                output.append("```json")
                output.append(json.dumps(extra_json, indent=2, ensure_ascii=False))
                output.append("```")
            except json.JSONDecodeError:
                pass

        output.append("")

    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(description="根据 trace_id 查询测试环境日志")
    parser.add_argument("trace_id", help="Trace ID")
    parser.add_argument("--start-time", type=int, help="开始时间戳(秒)，默认24小时前")
    parser.add_argument("--end-time", type=int, help="结束时间戳(秒)，默认当前时间")
    parser.add_argument("--page", type=int, default=1, help="页码，默认1")
    parser.add_argument("--page-size", type=int, default=100, help="每页数量，默认100")
    parser.add_argument("--output", "-o", help="输出文件路径")

    args = parser.parse_args()

    print(f"正在查询 trace_id: {args.trace_id} ...")

    logs_data = search_logs(
        trace_id=args.trace_id,
        start_time=args.start_time,
        end_time=args.end_time,
        page=args.page,
        page_size=args.page_size
    )

    output = format_logs(logs_data)
    print(output)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"\n结果已保存到: {args.output}")


if __name__ == "__main__":
    main()