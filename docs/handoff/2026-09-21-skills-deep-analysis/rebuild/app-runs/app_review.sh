#!/bin/zsh
# usage: app_review.sh <pr_id> <agent_id> <label>  — one review through the running app, result read from the DB
set -u
PR=$1; AG=$2; LABEL=$3
DB=$(grep -E '^DATABASE_URL=' /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/h1-skill-size-hypothesis-7b81ce/server/.env | cut -d= -f2- | tr -d '"')
curl -s "http://localhost:3201/pulls/$PR" >/dev/null
T0=$(psql "$DB" -X -A -t -c "select now()")
curl -s -o /dev/null -X POST localhost:3201/pulls/$PR/review -H 'content-type: application/json' -d "{\"agentId\":\"$AG\"}"
for i in {1..60}; do
  RID=$(psql "$DB" -X -A -t -c "select id from agent_runs where agent_id='$AG' and pr_id='$PR' and ran_at > '$T0' and status in ('done','failed') order by ran_at desc limit 1")
  [ -n "$RID" ] && break; sleep 5
done
[ -z "$RID" ] && { echo "$LABEL TIMEOUT"; exit 1; }
psql "$DB" -X -A -t -F ' | ' -c "select '$LABEL', ar.status, 'blockers='||ar.blockers, 'score='||ar.score, 'grounding='||coalesce(ar.grounding,''), 'skills_tok='||coalesce(rt.trace->'prompt_assembly'->>'skills_tokens','none'), coalesce((select string_agg(l->>'msg', '; ') from jsonb_array_elements(rt.trace->'log') l where l->>'msg' like '%served by%'), 'no served-by line'), 'run='||ar.id from agent_runs ar join run_traces rt on rt.run_id=ar.id where ar.id='$RID'"
psql "$DB" -X -A -t -c "select '    '||f.severity||': '||left(f.title,100) from findings f join reviews r on r.id=f.review_id where r.run_id='$RID'"
