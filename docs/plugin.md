# Procession Plugin Development Guide

Procession can be extended with small external programs called **plugins**. A plugin is any executable that writes a single line of JSON to `stdout`; Procession discovers it from a manifest, runs it on a schedule, and exposes the latest result in the system snapshot so the frontend can render it as part of the city.

This guide covers the manifest format, the plugin lifecycle, output contract, and a complete hello-world example.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Plugin Directory Layout](#plugin-directory-layout)
3. [Manifest Schema](#manifest-schema)
4. [Output Format](#output-format)
5. [Lifecycle & Scheduling](#lifecycle--scheduling)
6. [Security Rules](#security-rules)
7. [Consuming Plugin Data in the Frontend](#consuming-plugin-data-in-the-frontend)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Create a directory under your Procession plugin folder:

   ```bash
   mkdir -p ~/.procession/plugins/hello
   ```

2. Place a `manifest.json` and an executable inside it (see [Hello World](#hello-world-example) below).
3. Restart Procession or wait up to 30 seconds for the scanner to pick it up.
4. Open the frontend and inspect `snapshot.plugins.hello`.

---

## Plugin Directory Layout

```text
~/.procession/plugins/
  hello/
    manifest.json
    hello.py
```

- Each plugin lives in its own subdirectory under `~/.procession/plugins` (`%USERPROFILE%\.procession\plugins` on Windows).
- The directory name is used internally for hot-reload tracking, but the plugin identity in snapshots comes from the `id` field in `manifest.json`.
- The manifest **must** be named `manifest.json`.
- The executable can be a binary, a script with a shebang, or any interpreter invocation described in the manifest.

---

## Manifest Schema

`manifest.json` is a JSON file with the following fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | Unique plugin identifier. Used as the key in `snapshot.plugins`. Must be unique across all plugins. |
| `name` | string | yes | — | Human-readable name shown in logs and future UI surfaces. |
| `executable` | string | yes | — | Path to the executable. Relative paths are resolved against the plugin directory. Absolute paths are used as-is. |
| `args` | string[] | no | `[]` | Arguments passed to the executable. |
| `refresh_interval_secs` | integer | no | `5` | How often the plugin is invoked, in seconds. Minimum is `1`. |
| `timeout_secs` | integer | no | `10` | Maximum time the plugin is allowed to run before it is forcefully killed. Minimum is `1`. |

### Example manifest

```json
{
  "id": "weather",
  "name": "Local Weather",
  "executable": "python3",
  "args": ["weather.py"],
  "refresh_interval_secs": 60,
  "timeout_secs": 15
}
```

### Manifest resolution rules

- If `executable` contains `/` or `\\`, it is treated as a relative or absolute path and used directly.
- If `executable` is a bare name like `hello.py`, Procession resolves it as `<plugin-dir>/<id>/<executable>`.
- Empty executables and paths containing `..` are rejected.

---

## Output Format

A plugin must print **one line** of valid JSON to `stdout`. Procession reads only the first line of output; any additional lines are ignored.

```json
{"temperature_c": 22, "condition": "clear", "updated_at": 1710000000000}
```

### Output contract

- The root value must be a JSON object (`{}`).
- The object may contain any keys and nested structures.
- Procession does not impose a fixed schema; the frontend decides how to interpret the data.
- Keep the output small. Large payloads are transmitted to the frontend on every snapshot.

### Error handling

- Non-zero exit codes: the result is discarded and the previous snapshot value is retained.
- Invalid JSON: the result is discarded.
- Timeout: the plugin process is killed (`SIGKILL` on Unix, `taskkill /F /T` on Windows) and the result is discarded.
- Plugin failures are isolated; one failing plugin does not affect others or the core app.

---

## Lifecycle & Scheduling

1. **Discovery** — On startup and every 30 seconds, Procession scans `~/.procession/plugins/*/manifest.json`.
2. **Validation** — Each manifest is parsed and validated. Invalid manifests are skipped with a log line.
3. **Scheduling** — Valid plugins are run repeatedly according to `refresh_interval_secs`.
4. **Execution** — Each scheduled run spawns the plugin in a separate thread. Plugins run concurrently.
5. **Aggregation** — The latest successful JSON output for each `id` is stored in the system snapshot under `plugins`.

### Important notes

- Changing the manifest file is hot-reloaded on the next scan.
- Removing a plugin directory causes its data to be dropped from the next snapshot.
- Procession clamps `refresh_interval_secs` to a minimum of `1` second.
- The first run happens immediately after discovery; subsequent runs wait for the interval.

---

## Security Rules

Plugins run as the same user as Procession. Keep the following in mind:

- Do not place untrusted executables in the plugin directory.
- Path traversal in `executable` is rejected (`..` is not allowed).
- Plugins have no sandbox. They can read system state, write files, and open network connections.
- Use absolute paths only for executables you trust.

---

## Consuming Plugin Data in the Frontend

Plugin data is exposed on the system snapshot returned by `useSystemData`:

```tsx
const snapshot = useSystemData();
const weather = snapshot?.plugins?.weather;

if (weather) {
  console.log(weather.temperature_c);
}
```

The frontend can map plugin values to city visuals (e.g., weather affecting sky color, custom buildings, or overlay labels). There is no fixed visual contract yet; plugins are free-form data sources.

---

## Hello World Example

A minimal plugin written in Python.

### Directory

```text
~/.procession/plugins/hello/
  manifest.json
  hello.py
```

### `manifest.json`

```json
{
  "id": "hello",
  "name": "Hello World",
  "executable": "python3",
  "args": ["hello.py"],
  "refresh_interval_secs": 5,
  "timeout_secs": 5
}
```

### `hello.py`

```python
#!/usr/bin/env python3
import json
import time

print(json.dumps({
    "message": "Hello from Procession",
    "counter": int(time.time()) % 1000,
}))
```

### Run it independently

```bash
cd ~/.procession/plugins/hello
python3 hello.py
```

Expected output:

```json
{"message": "Hello from Procession", "counter": 123}
```

After Procession picks up the plugin, the frontend snapshot will contain:

```json
{
  "plugins": {
    "hello": {
      "message": "Hello from Procession",
      "counter": 123
    }
  }
}
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Plugin does not appear in snapshot | Plugin directory not under `~/.procession/plugins` or manifest not named `manifest.json` | Check path and filename. |
| Snapshot value never updates | Plugin exits non-zero or prints invalid JSON | Run the executable manually and inspect `stdout`/`stderr`. |
| High CPU usage | `refresh_interval_secs` too low | Increase the interval. |
| Plugin killed after timeout | Plugin runs longer than `timeout_secs` | Optimize the plugin or raise `timeout_secs`. |

---

## Next Steps

- Design a plugin schema that makes sense for your custom data source.
- Keep plugins small and focused; one plugin per domain.
- Share useful plugins with the Procession community.
