Models are downloaded at container startup into this folder. The container will fail to start if any required model is missing. It now contains model names for both stage 1 and stage 2

**Manifest file**
- Edit `models.json` in this folder.
- Each entry must contain `filename` and `url`.
- Example:
```
[
  { "filename": "uti_model.h5", "url": "https://example.com/uti_model.h5" },
  { "filename": "uti_drive.h5", "url": "https://drive.google.com/file/d/1AbCDeFgHiJkLmNoPqRstuVwXyZ012345/view?usp=sharing" }
]
```

Supported `url` formats:
- Standard Google Drive share links
- `https://` or `http://` direct downloads

Optional env:
- `MODELS_MANIFEST=/app/models/models.json` (defaults to this path)
- `MODELS_DIR=/app/models`
