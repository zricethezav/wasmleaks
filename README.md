# [WASMLeaks](gitleaks.io/playground)
A website to check for things that look like secrets. Submit bugs here.

## Building
clone it first
```
cp $(go env GOROOT)/misc/wasm/wasm_exec.js . && GOOS=js GOARCH=wasm go build -tags stdregex -ldflags="-s -w" -o gitleaks.wasm
```

## Running
```
python3 -m http.server 8000
```

## Viewing
```
http://localhost:8000/
```


