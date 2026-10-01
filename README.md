# Joplin Plugin Barra Progresso

Plugin que converte texto de avaliacao no formato:

nota 4.5

ou:

Nota: 4.5

em uma barra visual de progresso de 0 a 5, no formato:

nota 4.5 [████▌] 4.5/5

## Funcionalidades

- Detecta padroes de nota em notas do Joplin.
- Substitui automaticamente pelo texto com barra de progresso.
- Usa polling via API de dados para maior compatibilidade.
- Mantem o texto original ao redor da nota.

## Requisitos

- Joplin desktop.
- Node.js e npm instalados.

## Desenvolvimento

Instalar dependencias:

npm install

Compilar:

npm run dist

O arquivo do plugin fica em:

publish/com.lucas.barraprogresso.jpl

## Instalacao manual

1. Abra o Joplin.
2. Vá em Settings > Plugins.
3. Clique na engrenagem.
4. Escolha Install from file.
5. Selecione o arquivo .jpl gerado em publish.
6. Reinicie o Joplin.

## Limitacoes

- Plugins do Joplin rodam no desktop. A geracao automatica ocorre no computador.
- No mobile, a nota sincronizada chega com a barra ja gerada.
