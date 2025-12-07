---
applyTo: '**'
---
você é o agente do VS Code trabalhando no repositório gestor-tiny. preciso que você aplique a migration nova, faça commit e deixe tudo pronto para deploy (via git push). siga os passos abaixo exatamente, sem simplificar e sem pular etapa:
	1.	confirme que o projeto atual é o gestor-tiny na raiz do repo (onde ficam package.json e supabase/migrations).
	2.	abra e leia rapidamente o arquivo:
supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql
não altere o conteúdo. apenas entenda que essa migration:

	•	remove qualquer job do pg_cron cujo comando contenha sync_produtos_from_tiny
	•	e faz DROP FUNCTION IF EXISTS public.sync_produtos_from_tiny()

	3.	no terminal integrado do VS Code, na raiz do projeto, rode exatamente este comando:
supabase db push –linked –include-all
	4.	espere o comando terminar. se der erro:

	•	leia a mensagem com atenção
	•	tente corrigir o problema sem apagar nem alterar a migration 20251206120000_drop_sync_produtos_from_tiny.sql
	•	depois tente rodar novamente o mesmo comando
se não conseguir resolver, não invente solução, apenas traga o erro completo em forma de comentário no código ou em um arquivo de log para eu ver.

	5.	se o supabase db push --linked --include-all terminar com sucesso, anote em comentário num bloco de notas (por exemplo num arquivo docs/tmp_migrations_log.md) estas duas queries SQL para eu rodar manualmente no Supabase Studio e confirmar que tudo foi aposentado:

– ver se ainda existe job de cron chamando a função
select jobid, jobname, schedule, command, active
from cron.job
where command ilike ‘%sync_produtos_from_tiny%’;

– ver se a função ainda existe
select routine_name
from information_schema.routines
where specific_schema = ‘public’
and routine_name ilike ‘%sync_produtos_from_tiny%’;

não tente rodar essas queries você mesmo, apenas deixe documentado para eu executar.
	6.	depois do push bem-sucedido, rode na raiz do projeto:
npm run lint
e em seguida:
npm run build
	7.	se npm run lint ou npm run build falharem por algum erro introduzido agora, corrija o que for necessário de forma mínima e segura. não remova migrations, não mexa em tinyApi nem em código crítico de sync se não tiver relação direta com o erro. depois de corrigir, rode novamente npm run lint e npm run build até ficarem verdes.
	8.	quando tudo estiver passando, rode:
git status
em seguida faça um diff para revisar o que mudou:
git diff
	9.	adicione ao commit apenas o que é relevante a esta tarefa:

	•	a migration nova em supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql
	•	ajustes de docs onde foram atualizadas referências a sync_produtos_from_tiny (README, SUPABASE_CRON_GUIDE, copilot-instructions, instruções etc), se existirem
não adicione arquivos temporários nem coisas não relacionadas.

use:
git add supabase/migrations/20251206120000_drop_sync_produtos_from_tiny.sql
e também git add nos arquivos de documentação que você modificou.
	10.	crie um commit único com uma mensagem clara, por exemplo:
git commit -m “chore(db): drop legacy sync_produtos_from_tiny cron”
	11.	por fim, faça o push da branch atual para o remoto (assumindo que é a branch principal usada para deploy):
git push

não tente rodar vercel deploy nem outros comandos de deploy direto, apenas o git push. o deploy na vercel fica por conta da integração do repositório com a vercel.
	12.	no final, me dê um resumo em texto (num comentário ou num arquivo de log) dizendo:

	•	se o supabase db push rodou ok
	•	se lint e build passaram
	•	quais arquivos entraram no commitfez
	•	o hash do commit que você criou, se possível.