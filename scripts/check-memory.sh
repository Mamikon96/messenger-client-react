#!/usr/bin/env bash
# Проверка целостности AI-памяти (.ai/memory). Ненулевой код — память битая или устарела по формальным признакам.
# Проверяет структуру, штамп «Проверено», существование ссылок на файлы, уникальность и формат ID.
# Содержательную сверку с кодом выполняет агент (скилл project-memory).
set -uo pipefail
cd "$(dirname "$0")/.."

MEM=${MEM_DIR:-.ai/memory}   # MEM_DIR — для тестов (scripts/check-memory.test.js)
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

  # architecture.md — роутер, подробности по темам лежат в architecture/*.md (FE-125); каждый файл упомянут в роутере
  local arch_files=() af
  for af in "$dir"/architecture/*.md; do
    [ -e "$af" ] || continue
    arch_files+=("architecture/$(basename "$af")")
    grep -qF "architecture/$(basename "$af")" "$dir/architecture.md" 2>/dev/null \
      || fail "$dir/architecture.md: нет строки роутера для architecture/$(basename "$af")"
  done

  # Штамп «Проверено: дата @ sha[+dirty]» в state/tasks/architecture и architecture/*.md, sha должен существовать в git
  for f in state.md tasks.md architecture.md ${arch_files[@]+"${arch_files[@]}"}; do
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
    for sec in "## В работе" "## Бэклог"; do
      grep -q "^$sec" "$dir/tasks.md" || fail "$dir/tasks.md: нет секции '$sec'"
    done
    # История закрытых задач — в архиве done.md (FE-D27), чтобы старт задачи не читал её
    grep -q '^## Сделано' "$dir/tasks.md" && fail "$dir/tasks.md: раздел «Сделано» — перенеси записи в $dir/done.md"

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

    # «В работе»: у каждой задачи полный контракт (.ai/rules/task-contract.md)
    bash scripts/check-contract.sh "$dir/tasks.md" || fail "$dir/tasks.md: неполный контракт задачи (см. выше)"

  fi

  # Бэклог — индекс (FE-D41): строка задачи ≤200 символов, подробности — в $dir/backlog/FE-NN.md
  if [ -f "$dir/tasks.md" ]; then
    local long
    # Длина — в символах (mawk считает байты, кириллица вдвое длиннее), поэтому через node
    long=$(node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").split("\n");
let inBacklog = false;
for (const l of lines) {
  if (/^## /.test(l)) inBacklog = l.startsWith("## Бэклог");
  else if (inBacklog && l.startsWith("- **") && [...l].length > 200) console.log((l.match(/FE-[0-9]+/) || ["?"])[0]);
}' "$dir/tasks.md")
    for id in $long; do fail "$dir/tasks.md: строка бэклога $id длиннее 200 символов — подробности вынеси в $dir/backlog/$id.md"; done
    if [ -d "$dir/backlog" ]; then
      local bf name bid
      for bf in "$dir"/backlog/*.md; do
        [ -e "$bf" ] || continue
        name=$(basename "$bf")
        [ "$name" = README.md ] && continue
        if ! [[ $name =~ ^FE-[0-9]+\.md$ ]]; then
          fail "$bf: имя файла не вида FE-NN.md"
          continue
        fi
        bid=${name%.md}
        grep -qE "^- \*\*$bid\b" "$dir/tasks.md" || fail "$bf: в $dir/tasks.md нет строки задачи $bid"
      done
    fi
  fi

  # Архив «Сделано»: раздел есть, каждая запись начинается с даты
  if [ ! -f "$dir/done.md" ]; then
    fail "нет файла $dir/done.md (архив «Сделано»)"
  else
    grep -q '^## Сделано' "$dir/done.md" || fail "$dir/done.md: нет секции '## Сделано'"
    local done_bad
    done_bad=$(awk '/^## Сделано/{f=1;next} /^## /{f=0} f && /^- /' "$dir/done.md" | grep -vE '^- [0-9]{4}-[0-9]{2}-[0-9]{2} — ' || true)
    [ -z "$done_bad" ] || fail "$dir/done.md: записи «Сделано» без даты 'ГГГГ-ММ-ДД — ': $(echo "$done_bad" | head -1)"
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
# Архив решений (FE-D41): записи «ЗАМЕНЕНО»; ID не повторяются ни внутри архива, ни с decisions.md
if [ -f "$MEM/decisions-archive.md" ]; then
  a_ids=$(grep -oE '^## [A-Z]+-D[0-9]+' "$MEM/decisions-archive.md" | sed 's/^## //')
  a_dups=$(printf '%s\n%s\n' "${d_ids:-}" "$a_ids" | grep -v '^$' | sort | uniq -d)
  [ -z "$a_dups" ] || fail "$MEM/decisions-archive.md: ID повторяются (внутри архива или с decisions.md): $(echo $a_dups)"
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
