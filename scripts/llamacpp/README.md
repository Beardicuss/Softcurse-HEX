# HEX llama.cpp Local Model

This folder contains helpers for running HEX with a local GGUF model.

Expected model:

`models/qwen3/Qwen3-8B-Q4_K_M.gguf`

Run:

```powershell
npm run llama:qwen
```

The script looks for `llama-server.exe` in this order:

1. `LLAMA_SERVER_EXE` environment variable
2. `bin/llama-server.exe` inside this project
3. `llama-server` on PATH

HEX connects to the server through the `llamacpp` provider at:

`http://127.0.0.1:8080/v1/chat/completions`