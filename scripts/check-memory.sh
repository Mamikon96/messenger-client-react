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

  for f in state.md tasks.md queue.md architecture.md; do
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
    grep -q '^## Сделано' "$dir/tasks.md" && fail "$dir/tasks.md: раздел «Сделано» — перенеси записи в $dir/done/<ID>.md и строки — в таблицу $dir/done.md"

    # Уникальность ID и правильный префикс
    local ids dups bad
    # ID уникальны по tasks.md и queue.md вместе (FE-D53)
    ids=$(grep -hoE '^- \*\*[A-Z]+-[0-9]+' "$dir/tasks.md" "$dir/queue.md" 2>/dev/null | sed 's/^- \*\*//')
    dups=$(echo "$ids" | sort | uniq -d)
    [ -z "$dups" ] || fail "$dir/tasks.md, $dir/queue.md: повторяющиеся ID: $(echo $dups)"
    bad=$(echo "$ids" | grep -vE "^$tp-[0-9]+$" || true)
    [ -z "$bad" ] || fail "$dir/tasks.md, $dir/queue.md: ID не со своим префиксом $tp-: $(echo $bad)"

    # «В работе»: каждая задача с блоком «Осталось»
    local wip
    wip=$(awk '/^## В работе/{f=1;next} /^## /{f=0} f' "$dir/tasks.md")
    if echo "$wip" | grep -qE '^- \*\*'; then
      echo "$wip" | grep -q 'Осталось' || fail "$dir/tasks.md: в «В работе» есть задачи без блока «Осталось»"
    fi

    # «В работе»: у каждой задачи полный контракт (.ai/rules/task-contract.md)
    bash scripts/check-contract.sh "$dir/tasks.md" || fail "$dir/tasks.md: неполный контракт задачи (см. выше)"

  fi

  # Бэклог — индекс (FE-D41): строка задачи ≤200 символов, подробности — в $dir/backlog/FE-NN.md.
  # В «Бэклоге» tasks.md ≤7 задач, остальные — в queue.md (FE-D53); у строки есть (P<число>…;
  # худший приоритет в tasks.md не ниже лучшего в queue.md; в tasks.md <3 задач при непустой очереди — пополнить
  if [ -f "$dir/tasks.md" ]; then
    local problems
    # Длина — в символах (mawk считает байты, кириллица вдвое длиннее), поэтому через node
    problems=$(node -e '
const fs = require("node:fs");
const [dir] = process.argv.slice(1);
const rows = (file, section) => {
  if (!fs.existsSync(file)) return [];
  let on = !section;
  const out = [];
  for (const l of fs.readFileSync(file, "utf8").split("\n")) {
    if (/^## /.test(l)) on = !section || l.startsWith(section);
    else if (on && l.startsWith("- **")) out.push(l);
  }
  return out;
};
const tasks = rows(`${dir}/tasks.md`, "## Бэклог");
const queue = rows(`${dir}/queue.md`, null);
const id = (l) => (l.match(/^- \*\*([A-Z]+-[0-9]+)/) || [null, "?"])[1];
const prio = (l) => { const m = l.match(/^- \*\*[^ ]+ \(P([0-9]+)/); return m ? Number(m[1]) : null; };
const say = (m) => console.log(m);
for (const [name, list] of [["tasks.md", tasks], ["queue.md", queue]]) {
  for (const l of list) {
    if ([...l].length > 200) say(`${dir}/${name}: строка ${id(l)} длиннее 200 символов — подробности вынеси в ${dir}/backlog/${id(l)}.md`);
    if (prio(l) === null) say(`${dir}/${name}: у строки ${id(l)} нет приоритета вида (P<число>…`);
  }
}
if (tasks.length > 7) say(`${dir}/tasks.md: в «Бэклоге» ${tasks.length} задач, лимит 7 — менее приоритетные перенеси в ${dir}/queue.md`);
const tp = tasks.map(prio).filter((x) => x !== null);
const qp = queue.map(prio).filter((x) => x !== null);
if (tp.length && qp.length && Math.max(...tp) > Math.min(...qp)) say(`${dir}/queue.md: приоритет нарушен — в очереди P${Math.min(...qp)}, а в «Бэклоге» tasks.md есть P${Math.max(...tp)}`);
if (tasks.length < 3 && queue.length > 0) say(`${dir}/tasks.md: в «Бэклоге» ${tasks.length} задач (<3), а ${dir}/queue.md не пуст — пополни из queue.md до 7`);
' "$dir")
    [ -z "$problems" ] || while IFS= read -r line; do fail "$line"; done <<< "$problems"
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
        grep -qE "^- \*\*$bid\b" "$dir/tasks.md" "$dir/queue.md" 2>/dev/null || fail "$bf: в $dir/tasks.md и $dir/queue.md нет строки задачи $bid"
      done
    fi
  fi

  # Архив «Сделано» (FE-D52): done.md — роутер-таблица `| Дата | ID | Суть | Файл |`, записи лежат в done/<ID>.md
  # (без ID — done/<ГГГГ-ММ-ДД>-<слаг>.md); строка роутера на каждую запись, дата и ID совпадают с записью
  if [ ! -f "$dir/done.md" ]; then
    fail "нет файла $dir/done.md (роутер архива «Сделано»)"
  else
    grep -qE '^## Сделано' "$dir/done.md" && fail "$dir/done.md: раздел «Сделано» — записи лежат в $dir/done/<ID>.md, в роутере только таблица"
    local rows row_date row_id row_file
    rows=$(grep -E '^\| *[0-9]{4}-[0-9]{2}-[0-9]{2} *\|' "$dir/done.md" || true)
    local dr_bad
    dr_bad=$(grep -E '^- ' "$dir/done.md" || true)
    [ -z "$dr_bad" ] || fail "$dir/done.md: запись-строка в роутере (должна быть в done/<ID>.md): $(echo "$dr_bad" | head -1 | cut -c1-60)"
    while IFS= read -r row; do
      [ -n "$row" ] || continue
      row_file=$(echo "$row" | awk -F'|' '{print $(NF-1)}' | tr -d ' `')
      [[ $row_file =~ ^done/[^/]+\.md$ ]] || fail "$dir/done.md: строка роутера должна ссылаться на done/*.md, а не на $row_file"
      [ -f "$dir/$row_file" ] || fail "$dir/done.md: строка роутера ссылается на несуществующий файл $row_file"
    done <<< "$rows"
    local dfile dname dbase want have head1 recs line
    for dfile in "$dir"/done/*.md; do
      [ -e "$dfile" ] || continue
      dbase=$(basename "$dfile" .md)
      dname="done/$dbase.md"
      head1=$(head -1 "$dfile")
      [ "$head1" = "# $dbase" ] || fail "$dname: заголовок '$head1' не совпадает с именем файла (нужен '# $dbase')"
      # записи файла: «дата|ID» (ID — «—», если запись без ID)
      have=""
      while IFS= read -r line; do
        [[ $line =~ ^'- '([0-9]{4}-[0-9]{2}-[0-9]{2})' — '(.*)$ ]] || { fail "$dname: запись без даты 'ГГГГ-ММ-ДД — ': $(echo "$line" | cut -c1-60)"; continue; }
        local rdate=${BASH_REMATCH[1]} rtext=${BASH_REMATCH[2]} rid='—'
        [[ $rtext =~ ^([A-Z]+-[0-9]+)([^0-9-]|$) ]] && rid=${BASH_REMATCH[1]}
        if [[ $dbase =~ ^[A-Z]+-[0-9]+$ ]]; then
          [ "$rid" = "$dbase" ] || fail "$dname: запись начинается с ID '$rid', а не с $dbase"
        else
          [ "$rid" = '—' ] || fail "$dname: файл без ID в имени содержит запись с ID $rid"
        fi
        have+="$rdate|$rid"$'\n'
      done < <(grep -E '^- ' "$dfile")
      want=$(echo "$rows" | grep -F "\`$dname\`" | awk -F'|' '{gsub(/ /,"",$2); gsub(/ /,"",$3); print $2 "|" $3}' || true)
      if [ -z "$want" ]; then
        fail "$dir/done.md: нет строки роутера для $dname"
      elif [ "$(echo "$want" | sort)" != "$(printf '%s' "$have" | sort)" ]; then
        fail "$dir/done.md: строки роутера для $dname (дата|ID: $(echo $want)) не совпадают с записями файла ($(echo $have))"
      fi
    done
  fi
}

check_files FE

# Решения: SH-Dxx (общие) и FE-Dxx (frontend), ID уникальны. decisions.md — роутер (FE-130): строка таблицы
# `| ID | … | decisions/<файл>.md |` на каждое решение; тексты решений лежат в decisions/*.md
d_ids=""
if [ -f "$MEM/decisions.md" ]; then
  for id in $(grep -oE '^## [A-Z]+-D[0-9]+' "$MEM/decisions.md" | sed 's/^## //' || true); do
    fail "$MEM/decisions.md: текст решения $id в роутере — перенести в decisions/<тема>.md"
  done
  router_ids=$(grep -oE '^\| *[A-Z]+-D[0-9]+ *\|' "$MEM/decisions.md" | grep -oE '[A-Z]+-D[0-9]+' || true)
  for df in "$MEM"/decisions/*.md; do
    [ -e "$df" ] || continue
    dn="decisions/$(basename "$df")"
    grep -E '^\|' "$MEM/decisions.md" | grep -qF "$dn" || fail "$MEM/decisions.md: нет строки роутера для $dn"
    for id in $(grep -oE '^## [A-Z]+-D[0-9]+' "$df" | sed 's/^## //'); do
      d_ids=$(printf '%s\n%s\n' "$d_ids" "$id")
      row=$(grep -E "^\| *$id *\|" "$MEM/decisions.md" || true)
      if [ -z "$row" ]; then
        fail "$MEM/decisions.md: нет строки роутера для $id ($dn)"
      else
        echo "$row" | grep -qF "$dn" || fail "$MEM/decisions.md: строка $id указывает не на $dn"
      fi
    done
  done
  d_ids=$(echo "$d_ids" | grep -v '^$' || true)
  r_dups=$(echo "$router_ids" | sort | uniq -d)
  [ -z "$r_dups" ] || fail "$MEM/decisions.md: повторяющиеся строки роутера: $(echo $r_dups)"
  for id in $router_ids; do
    echo "$d_ids" | grep -qx "$id" || fail "$MEM/decisions.md: строка роутера $id без решения в decisions/*.md"
  done
  d_dups=$(echo "$d_ids" | sort | uniq -d)
  [ -z "$d_dups" ] || fail "$MEM/decisions: повторяющиеся ID: $(echo $d_dups)"
  d_bad=$(echo "$d_ids" | grep -vE '^(SH|FE)-D[0-9]+$' || true)
  [ -z "$d_bad" ] || fail "$MEM/decisions: ID не вида SH-Dxx/FE-Dxx: $(echo $d_bad)"
fi
# Архив решений (FE-D41): записи «ЗАМЕНЕНО»; ID не повторяются ни внутри архива, ни с decisions/*.md
if [ -f "$MEM/decisions-archive.md" ]; then
  a_ids=$(grep -oE '^## [A-Z]+-D[0-9]+' "$MEM/decisions-archive.md" | sed 's/^## //')
  a_dups=$(printf '%s\n%s\n' "${d_ids:-}" "$a_ids" | grep -v '^$' | sort | uniq -d)
  [ -z "$a_dups" ] || fail "$MEM/decisions-archive.md: ID повторяются (внутри архива или с decisions/*.md): $(echo $a_dups)"
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
