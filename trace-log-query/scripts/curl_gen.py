#!/usr/bin/env python3
import base64
import hashlib
import hmac
import random
import time
import urllib.parse
import requests
from requests.auth import AuthBase
import json

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

trace_id = "fa9a44d683cca2182046064873cc7841"
now = 1775211035
start_time = now - 3600 * 24

print(f"查询范围: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(start_time))} - {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(now))} UTC")

sess = requests.Session()
sess.auth = VRSchedulerAuth(AK, SK)

payload = {"log_project": "test-tke-inf-1", "log_store": "test-cube-app-logs",
           "query": f"trace_id:{trace_id}", "start_time": start_time, "end_time": now, "page": 1, "page_size": 100}

req = requests.Request('POST', URL, json=payload)
p = sess.prepare_request(req)
sess.auth(p)

print("=== curl 命令 ===")
curl = f"curl -X POST '{URL}' \\\n"
for k, v in p.headers.items():
    curl += f"  -H '{k}: {v}' \\\n"
curl += f"  -d '{json.dumps(payload)}'"
print(curl)

print("\n=== 实际请求 ===")
resp = sess.post(URL, json=payload)
print(f"Status: {resp.status_code}")
print(json.dumps(resp.json(), ensure_ascii=False, indent=2))