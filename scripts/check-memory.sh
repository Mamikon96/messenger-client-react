#!/usr/bin/env bash
# Проверка целостности AI-памяти (.ai/memory). Ненулевой код — память битая или устарела по формальным признакам.
# Проверяет структуру, штамп «Проверено», существование ссылок на файлы, уникальность и формат ID.
# Содержательную сверку с кодом выполняет агент (скилл project-memory).
set -uo pipefail
cd "$(dirname "$0")/.."

MEM=.ai/memory
errors=0
fail() { echo "  ✗ $1"; errors=$((errors + 1)); }

echo "==> Проверка памяти ($MEM)"

for f in README.md decisions.md; do
  [ -f "$MEM/$f" ] || fail "нет файла $MEM/$f"
done

check_files() {
  local tp=$1   # tp = FE (префикс задач)
  local dir="$MEM"

  for f in state.md tasks.md architecture.md; do
    [ -f "$dir/$f" ] || fail "нет файла $dir/$f"
  done

  # Штамп «Проверено: дата @ sha[+dirty]» в state/tasks/architecture, sha должен существовать в git
  for f in state.md tasks.md architecture.md; do
    [ -f "$dir/$f" ] || continue
    local stamp sha
    stamp=$(grep -m1 -E '^> Проверено: ' "$dir/$f" || true)
    if ! [[ $stamp =~ ^'> Проверено: '[0-9]{4}-[0-9]{2}-[0-9]{2}' @ '([0-9a-f]{7,40})(\+dirty)?$ ]]; then
      fail "$dir/$f: нет/неверный штамп '> Проверено: ГГГГ-ММ-ДД @ <sha>[+dirty]'"
    else
      sha=${BASH_REMATCH[1]}
      git cat-file -e "${sha}^{commit}" 2>/dev/null || fail "$dir/$f: коммит $sha из штампа не найден в git"
    fi
  done

  if [ -f "$dir/tasks.md" ]; then
    for sec in "## В работе" "## Бэклог" "## Сделано"; do
      grep -q "^$sec" "$dir/tasks.md" || fail "$dir/tasks.md: нет секции '$sec'"
    done

    # Уникальность ID и правильный префикс
    local ids dups bad
    ids=$(grep -oE '^- \*\*[A-Z]+-[0-9]+' "$dir/tasks.md" | sed 's/^- \*\*//')
    dups=$(echo "$ids" | sort | uniq -d)
    [ -z "$dups" ] || fail "$dir/tasks.md: повторяющиеся ID: $(echo $dups)"
    bad=$(echo "$ids" | grep -vE "^$tp-[0-9]+$" || true)
    [ -z "$bad" ] || fail "$dir/tasks.md: ID не со своим префиксом $tp-: $(echo $bad)"

    # «В работе»: каждая задача с блоком «Осталось»
    local wip
    wip=$(awk '/^## В работе/{f=1;next} /^## /{f=0} f' "$dir/tasks.md")
    if echo "$wip" | grep -qE '^- \*\*'; then
      echo "$wip" | grep -q 'Осталось' || fail "$dir/tasks.md: в «В работе» есть задачи без блока «Осталось»"
    fi

    # «Сделано»: каждая запись начинается с даты
    local done_bad
    done_bad=$(awk '/^## Сделано/{f=1;next} /^## /{f=0} f && /^- /' "$dir/tasks.md" | grep -vE '^- [0-9]{4}-[0-9]{2}-[0-9]{2} — ' || true)
    [ -z "$done_bad" ] || fail "$dir/tasks.md: записи «Сделано» без даты 'ГГГГ-ММ-ДД — ': $(echo "$done_bad" | head -1)"
  fi
}

check_files FE

# Решения: SH-Dxx (общие) и FE-Dxx (frontend), ID уникальны
if [ -f "$MEM/decisions.md" ]; then
  d_ids=$(grep -oE '^## [A-Z]+-D[0-9]+' "$MEM/decisions.md" | sed 's/^## //')
  d_dups=$(echo "$d_ids" | sort | uniq -d)
  [ -z "$d_dups" ] || fail "$MEM/decisions.md: повторяющиеся ID: $(echo $d_dups)"
  d_bad=$(echo "$d_ids" | grep -vE '^(SH|FE)-D[0-9]+$' || true)
  [ -z "$d_bad" ] || fail "$MEM/decisions.md: ID не вида SH-Dxx/FE-Dxx: $(echo $d_bad)"
fi

# Актуальность: изменённые (относительно HEAD) файлы кода не должны быть новее tasks.md — память обновляют после любых правок
tasks="$MEM/tasks.md"
if [ -f "$tasks" ]; then
  while IFS= read -r p; do
    [ -f "$p" ] && [ "$p" -nt "$tasks" ] && fail "$p изменён позже $tasks — актуализируй задачи в памяти (и штамп)"
  done < <(git status --porcelain -uall -- src e2e scripts package.json playwright.config.js 2>/dev/null | awk '{print $NF}')
fi

# Ссылки на файлы в обратных кавычках должны существовать (src/, e2e/, scripts/, .ai/, корневые конфиги, ../ относительно файла)
# Проверяются CLAUDE.md и все .md в .ai/ (память и rules)
while IFS= read -r md; do
  dir=$(dirname "$md")
  while IFS= read -r ref; do
    path=${ref%%[,.:;)]}
    case $path in *'*'*|*'<'*|*'…'*|*' '*) continue;; esac
    case $path in
      src/*|e2e/*|scripts/*|.ai/*|package.json|playwright.config.js|CLAUDE.md|README.md) target=$path;;
      rules/*|memory/*) target=.ai/$path;;
      ../*) target="$dir/$path";;
      *) continue;;
    esac
    [ -e "$target" ] || fail "$md: ссылка на несуществующий путь '$path'"
  done < <(grep -oE '`[^`]+`' "$md" | tr -d '`' | sort -u)
done < <({ find .ai -name '*.md'; echo CLAUDE.md; })

if [ "$errors" -gt 0 ]; then
  echo "==> Память НЕ прошла проверку: ошибок $errors"
  exit 1
fi
echo "==> Память в порядке"
