#!/usr/bin/env python3
import json
import time

print(json.dumps({
    "message": "Hello from Procession",
    "counter": int(time.time()) % 1000,
}))
