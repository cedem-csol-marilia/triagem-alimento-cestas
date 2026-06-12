-- Preenche respostas_forms.familia_id usando o vínculo que já existe do lado
-- da família (familias.ids_respostas_forms). Antes, decisões "casas separadas"
-- e "recadastro" na triagem não gravavam o familia_id de volta na resposta.
-- Idempotente: só toca em linhas com familia_id nulo.

update respostas_forms r
set familia_id = f.id
from familias f
where r.familia_id is null
  and f.ids_respostas_forms is not null
  and r.id = any(f.ids_respostas_forms);

-- Recadastros antigos: liga à candidata confirmada na decisão.
update respostas_forms
set familia_id = candidata_familia_id
where familia_id is null
  and decisao = 'recadastro'
  and candidata_familia_id is not null;
