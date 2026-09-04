#!/usr/bin/env bash
# Builds a small git repository that contains the cases the history parser has to
# survive: renames, delete + resurrect, non-ASCII and quoted paths, a merge,
# a file without an extension, a binary file and a mode change.
set -euo pipefail

DEST="${1:-/tmp/fixture-repo}"
rm -rf "$DEST"
mkdir -p "$DEST"
cd "$DEST"

git init -q -b main
git config user.name "Fixture Bot"
git config user.email "fixture@example.com"
git config commit.gpgsign false

commit() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -m "$2"; }

mkdir -p src/core src/ui docs
printf 'print("hello")\n' > src/core/app.py
printf 'export const x = 1\n' > src/ui/index.ts
printf '# Docs\n' > docs/readme.md
printf 'all:\n\techo build\n' > Makefile
git add -A
commit "2024-01-05T10:00:00" "initial layout"

printf 'print("hello world")\n' >> src/core/app.py
printf 'export const y = 2\n' >> src/ui/index.ts
git add -A
commit "2024-01-06T11:30:00" "tweak app and ui"

git mv src/core/app.py src/core/application.py
git add -A
commit "2024-02-01T09:00:00" "rename app.py -> application.py"

git rm -q docs/readme.md
git add -A
commit "2024-02-02T09:00:00" "drop docs"

mkdir -p docs
printf '# Docs again\n' > docs/readme.md
git add -A
commit "2024-03-10T14:00:00" "resurrect docs"

mkdir -p "src/ui/компоненты"
printf 'export const b = 3\n' > "src/ui/компоненты/кнопка.tsx"
printf 'x\n' > "src/ui/space in name.ts"
printf 'q\n' > 'src/ui/quote".ts'
git add -A
commit "2024-03-11T15:00:00" "add unicode and awkward paths"

git checkout -q -b feature
printf 'export const feat = true\n' > src/ui/feature.ts
git add -A
commit "2024-03-12T10:00:00" "feature work"

git checkout -q main
head -c 512 /dev/urandom > assets.bin
chmod +x Makefile
git add -A
commit "2024-03-12T12:00:00" "binary asset + mode change"

GIT_AUTHOR_DATE="2024-03-13T10:00:00" GIT_COMMITTER_DATE="2024-03-13T10:00:00" \
  git merge -q --no-ff feature -m "merge feature"

git mv src/ui src/interface
git add -A
commit "2024-04-01T10:00:00" "move directory src/ui -> src/interface"

echo "fixture repo ready at $DEST"
