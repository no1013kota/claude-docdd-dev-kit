#!/usr/bin/env bash
# Unity のプロジェクト（docdd 未導入・git 管理済み・名前とメール設定済み）を作る。
# Unity の目印（ProjectSettings/ProjectVersion.txt・Packages/manifest.json）、Unity 向けの .gitignore、
# 自分で書いた CLAUDE.md、Assets の .cs と .meta、docs の運用文書を置く。
# docs の運用文書が指すファイルは、すべて実在させる（参照の検査で落ちないように）。
set -euo pipefail
git init -q
git config user.name "docdd eval"
git config user.email "eval@example.com"
mkdir -p ProjectSettings Packages Assets/_Project/Scripts docs
cat > ProjectSettings/ProjectVersion.txt <<'TXT'
m_EditorVersion: 6000.3.24f1
m_EditorVersionWithRevision: 6000.3.24f1 (4e7b9b5b6244)
TXT
cat > Packages/manifest.json <<'JSON'
{
  "dependencies": {
    "com.unity.inputsystem": "1.20.0",
    "com.unity.render-pipelines.universal": "17.3.0",
    "com.unity.test-framework": "1.6.0",
    "com.unity.ugui": "2.0.0"
  }
}
JSON
cat > .gitignore <<'TXT'
/[Ll]ibrary/
/[Tt]emp/
/[Oo]bj/
/[Bb]uild/
/[Bb]uilds/
/[Ll]ogs/
/[Uu]ser[Ss]ettings/
*.csproj
*.sln
*.log
TXT
cat > Assets/_Project.meta <<'META'
fileFormatVersion: 2
guid: 8a1d0c3e5b7f4a2c9e6d1f0b3a5c7e90
folderAsset: yes
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
META
cat > Assets/_Project/Scripts.meta <<'META'
fileFormatVersion: 2
guid: 2c4e6a8b0d1f3e5a7c9b1d3f5e7a9c0b
folderAsset: yes
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
META
cat > Assets/_Project/Scripts/UnitMover.cs <<'CS'
using UnityEngine;

public class UnitMover : MonoBehaviour
{
    [SerializeField] private float speed = 3f;

    public void MoveTowards(Vector3 target)
    {
        transform.position = Vector3.MoveTowards(transform.position, target, speed * Time.deltaTime);
    }
}
CS
cat > Assets/_Project/Scripts/UnitMover.cs.meta <<'META'
fileFormatVersion: 2
guid: 3f1c2b7a9d8e4f60a1b2c3d4e5f60718
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
META
cat > CLAUDE.md <<'MD'
# RTS Game Claude Instructions

Read `docs/UNITY_WORKFLOW.md` before changing Unity assets.

- Unity Editor: `6000.3.24f1`
- Team-authored assets live under `Assets/_Project/`.
- Do not hand-edit `.unity`, `.prefab`, or `.meta` files. Change them in Unity Editor or with Editor scripts.
- Never commit `Library/`, `Temp/`, or `Logs/`.
MD
cat > docs/UNITY_WORKFLOW.md <<'MD'
# Unity Workflow

## Scripts

Gameplay scripts live in `Assets/_Project/Scripts/`. Unit movement is implemented in `Assets/_Project/Scripts/UnitMover.cs`.

## Tests

Run tests from the Unity Test Runner (EditMode and PlayMode). Close the Editor before running tests from the command line.

## Assets

- Move or rename assets in Unity Editor so their `.meta` files keep the same GUID.
- Make scene and prefab changes in Unity Editor.
MD
git add ProjectSettings/ProjectVersion.txt Packages/manifest.json .gitignore Assets/_Project.meta Assets/_Project/Scripts.meta Assets/_Project/Scripts/UnitMover.cs Assets/_Project/Scripts/UnitMover.cs.meta CLAUDE.md docs/UNITY_WORKFLOW.md
git commit -q -m "chore: Unity プロジェクトと運用文書"
