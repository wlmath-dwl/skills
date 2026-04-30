# i18n-lang Agent Config

```yaml
i18n:
  defaultNamespace: page
  locales:
    - de-DE
    - en-US
    - es-ES
    - fr-FR
    - id-ID
    - it-IT
    - ja-JP
    - ko-KR
    - ms-MY
    - nl-NL
    - pl-PL
    - pt-PT
    - sr-Cyrl
    - zh-TW
```

Place this file in the target project root and change `defaultNamespace` /
`locales` for that project. The i18n-lang scripts read these values before
extracting, reviewing, translating, and applying keys.
