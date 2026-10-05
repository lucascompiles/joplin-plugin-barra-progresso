import joplin from 'api';

// ===== PARAMETROS =====
// MODO: 'html' (barra colorida com gradiente/mascara) ou 'texto' (blocos de caractere, sem cor)
const MODO = 'html';
const ESCALA = 5;

// Modo html: largura total da barra em pixels e altura em pixels
const COMPRIMENTO_PX = 140;
const ALTURA = 12;
const RAIO_BORDA = 3;

// Modo texto: quantidade de blocos de caractere
const COMPRIMENTO_CHARS = 10;

const MOSTRAR_COLCHETES = false;

// Gradiente: true usa linear-gradient; false usa cor sólida (COR_FIM) mascarada
const USAR_GRADIENTE = true;
const COR_INICIO = '#cb1e1e';
const COR_MEIO = '#a25e00';   // opcional: deixe vazio para usar só inicio e fim; ex.: '#eab308'
const COR_FIM = '#00ff0d';
const COR_VAZIA = '#383838';  // trilho de fundo (parte nao preenchida)

const CARACTER_CHEIO = String.fromCharCode(9608);
const CARACTER_MEIO = String.fromCharCode(9612);
const CARACTER_VAZIO = String.fromCharCode(9617);

const INTERVALO_MS = 2000;
const PROTECAO_EDICAO_MS = 1500;
const LOG_ARQUIVO = '/tmp/barra-plugin.log';
const PREFIXO_BARRA_HTML = '<span style="display:inline-block;vertical-align:middle;width:';

// Paginacao da API de dados: ate 100 itens por pagina, teto de seguranca de 100 paginas
const LIMITE_PAGINA = 100;
const MAX_PAGINAS = 100;

// Teto de reescritas por ciclo (protecao de rajada de escrita; 1 reproduz o comportamento antigo do break)
const MAX_REESCRITAS_POR_CICLO = 10;

interface NumeroLido {
	valor: number;
	fim: number;
}

interface RegistroCompat {
	onStart: () => Promise<void>;
	onStop?: () => void;
}

let intervalo: ReturnType<typeof setInterval> | null = null;
let processando = false;
let ticks = 0;
let ultimoErro = '';
let errosIguais = 0;

function escreverLog(mensagem: string, dado?: any): void {
	let linha = new Date().toISOString() + ' [barra] ' + mensagem;

	if (dado !== undefined) {
		try {
			linha += ' ' + JSON.stringify(dado);
		} catch (e) {
			linha += ' [dado_nao_serializavel]';
		}
	}

	linha += '\n';

	try {
		const fs = require('fs');
		fs.appendFileSync(LOG_ARQUIVO, linha);
	} catch (e) {
		console.log('[barra] ' + mensagem, dado);
	}
}

function registrarErro(rotulo: string, erro: any): void {
	let mensagem = rotulo + ' ' + String(erro);

	if (mensagem === ultimoErro) {
		errosIguais += 1;

		if ((errosIguais % 30) !== 0) {
			return;
		}

		mensagem = mensagem + ' repetido ' + String(errosIguais);
	} else {
		ultimoErro = mensagem;
		errosIguais = 1;
	}

	escreverLog(mensagem);
}

function ehDigito(c: string): boolean {
	return c >= '0' && c <= '9';
}

function ehLetraOuDigito(c: string): boolean {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

function limiteAnterior(texto: string, pos: number): boolean {
	if (pos <= 0) return true;
	return !ehLetraOuDigito(texto.charAt(pos - 1));
}

function ehCaracterBarra(c: string): boolean {
	return c === CARACTER_CHEIO || c === CARACTER_MEIO || c === CARACTER_VAZIO;
}

function soCaracteresBarra(texto: string): boolean {
	if (texto.length === 0) return false;

	for (let i = 0; i < texto.length; i++) {
		if (!ehCaracterBarra(texto.charAt(i))) {
			return false;
		}
	}

	return true;
}

function clamp01(n: number): number {
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

function pularEspacos(texto: string, i: number): number {
	while (i < texto.length && (texto.charAt(i) === ' ' || texto.charAt(i) === '\t')) {
		i++;
	}

	return i;
}

function pularSeparadoresInicial(texto: string, i: number): number {
	while (i < texto.length && (texto.charAt(i) === ' ' || texto.charAt(i) === ':' || texto.charAt(i) === '\t')) {
		i++;
	}

	return i;
}

function lerNumero(texto: string, inicio: number): NumeroLido {
	let i = inicio;
	let s = '';

	while (i < texto.length && (ehDigito(texto.charAt(i)) || texto.charAt(i) === '.' || texto.charAt(i) === ',')) {
		s += texto.charAt(i);
		i++;
	}

	if (s.length === 0) {
		return { valor: NaN, fim: inicio };
	}

	return { valor: parseFloat(s.replace(',', '.')), fim: i };
}

function pularDenominador(texto: string, i: number): number {
	i = pularEspacos(texto, i);

	if (i < texto.length && texto.charAt(i) === '/') {
		let j = i + 1;
		let d = '';

		while (j < texto.length && ehDigito(texto.charAt(j))) {
			d += texto.charAt(j);
			j++;
		}

		if (d.length > 0) {
			return j;
		}
	}

	return i;
}

function pularBarraHtml(texto: string, i: number): number {
	let prof = 0;
	let j = i;
	const n = texto.length;

	while (j < n) {
		if (texto.charAt(j) === '<') {
			if (texto.substr(j, 5) === '<span') {
				prof++;
				const fim = texto.indexOf('>', j);

				if (fim < 0) {
					return n;
				}

				j = fim + 1;
				continue;
			}

			if (texto.substr(j, 6) === '</span>') {
				prof--;
				j += 6;

				if (prof <= 0) {
					return j;
				}

				continue;
			}
		}

		j++;
	}

	return n;
}

function pularBarraVisual(texto: string, i: number): number {
	if (i < 0) return 0;
	if (i >= texto.length) return i;

	const c = texto.charAt(i);

	if (c === '[') {
		const d = i + 1;

		if (texto.slice(d, d + PREFIXO_BARRA_HTML.length) === PREFIXO_BARRA_HTML) {
			const fh = pularBarraHtml(texto, d);

			if (fh > d && fh < texto.length && texto.charAt(fh) === ']') {
				return fh + 1;
			}

			return fh;
		}

		const fecha = texto.indexOf(']', d);

		if (fecha >= 0 && soCaracteresBarra(texto.slice(d, fecha))) {
			return fecha + 1;
		}
	}

	if (texto.slice(i, i + PREFIXO_BARRA_HTML.length) === PREFIXO_BARRA_HTML) {
		return pularBarraHtml(texto, i);
	}

	let j = i;

	while (j < texto.length && ehCaracterBarra(texto.charAt(j))) {
		j++;
	}

	if (j > i) {
		return j;
	}

	return i;
}

function gerarBarraTexto(valor: number): string {
	const escala = ESCALA > 0 ? ESCALA : 1;
	const proporcao = clamp01(valor / escala);
	const total = COMPRIMENTO_CHARS > 0 ? COMPRIMENTO_CHARS : 1;
	const totalMeios = Math.round(proporcao * total * 2);
	const cheios = Math.floor(totalMeios / 2);
	const meia = (totalMeios % 2) === 1;
	const vazios = total - cheios - (meia ? 1 : 0);

	let barra = '';

	for (let i = 0; i < cheios; i++) {
		barra += CARACTER_CHEIO;
	}

	if (meia) {
		barra += CARACTER_MEIO;
	}

	for (let i = 0; i < vazios; i++) {
		barra += CARACTER_VAZIO;
	}

	return barra;
}

function gerarBarraHtml(valor: number): string {
	const escala = ESCALA > 0 ? ESCALA : 1;
	const proporcao = clamp01(valor / escala);
	const total = COMPRIMENTO_PX > 0 ? COMPRIMENTO_PX : 1;
	const fatia = Math.round(total * proporcao);

	let grad: string;

	if (!USAR_GRADIENTE) {
		grad = COR_FIM;
	} else {
		const meio = String(COR_MEIO || '').trim();

		if (meio.length > 0) {
			grad = 'linear-gradient(to right, ' + COR_INICIO + ' 0%, ' + meio + ' 50%, ' + COR_FIM + ' 100%)';
		} else {
			grad = 'linear-gradient(to right, ' + COR_INICIO + ', ' + COR_FIM + ')';
		}
	}

	// trilho externo: largura total, fundo vazio, arredondado, clipa tudo dentro
	let html = '<span style="display:inline-block;vertical-align:middle;width:' + total + 'px;height:' + ALTURA + 'px;border-radius:' + RAIO_BORDA + 'px;overflow:hidden;background-color:' + COR_VAZIA + ';">';

	// camada de mascara: largura = fracao preenchida, corta o que passa
	if (fatia > 0) {
		html += '<span style="display:block;width:' + fatia + 'px;height:' + ALTURA + 'px;overflow:hidden;">';
		// gradiente interno: largura = total FIXO, nunca deforma, so e revelado ate 'fatia'
		html += '<span style="display:block;width:' + total + 'px;height:' + ALTURA + 'px;background:' + grad + ';"></span>';
		html += '</span>';
	}

	html += '</span>';

	return html;
}

function processarNota(body: string): string {
	const alvo = 'nota';
	const lower = body.toLowerCase();
	let resultado = '';
	let i = 0;

	while (i < body.length) {
		const pos = lower.indexOf(alvo, i);

		if (pos < 0) {
			resultado += body.slice(i);
			break;
		}

		if (!limiteAnterior(lower, pos)) {
			resultado += body.slice(i, pos + alvo.length);
			i = pos + alvo.length;
			continue;
		}

		resultado += body.slice(i, pos);

		const fimLabel = pos + alvo.length;
		const j = pularSeparadoresInicial(body, fimLabel);
		const prefixo = body.slice(pos, j);

		let valor = NaN;
		let cursor = j;

		const leitura = lerNumero(body, cursor);

		if (!isNaN(leitura.valor)) {
			valor = leitura.valor;
			cursor = pularDenominador(body, leitura.fim);
		}

		let depois = pularBarraVisual(body, cursor);
		depois = pularEspacos(body, depois);

		if (isNaN(valor)) {
			const leitura2 = lerNumero(body, depois);

			if (!isNaN(leitura2.valor)) {
				valor = leitura2.valor;
				depois = pularDenominador(body, leitura2.fim);
			}
		} else {
			const leitura2 = lerNumero(body, depois);

			if (!isNaN(leitura2.valor)) {
				depois = pularDenominador(body, leitura2.fim);
			}
		}

		if (isNaN(valor)) {
			resultado += prefixo;
			i = j;
			continue;
		}

		const escala = ESCALA > 0 ? ESCALA : 1;

		if (valor < 0) {
			valor = 0;
		}

		if (valor > escala) {
			valor = escala;
		}

		const barraInterna = MODO === 'html' ? gerarBarraHtml(valor) : gerarBarraTexto(valor);
		const barra = MOSTRAR_COLCHETES ? '[' + barraInterna + ']' : barraInterna;

		let saida = prefixo;

		if (saida.length === 0 || (saida.charAt(saida.length - 1) !== ' ' && saida.charAt(saida.length - 1) !== '\t')) {
			saida += ' ';
		}

		saida += barra + ' ' + valor.toFixed(1) + '/' + escala;

		resultado += saida;
		i = depois;
	}

	return resultado;
}

function extrairLista(res: any): any[] {
	if (Array.isArray(res)) return res;
	if (res && Array.isArray(res.items)) return res.items;
	if (res && Array.isArray(res.notes)) return res.notes;
	if (res && res.data && Array.isArray(res.data)) return res.data;
	return [];
}

async function buscarPagina(pagina: number): Promise<any> {
	const tentativas: any[] = [
		{ fields: ['id', 'body', 'updated_time'], page: pagina, limit: LIMITE_PAGINA },
		{ fields: ['id', 'body'], page: pagina, limit: LIMITE_PAGINA },
		{ page: pagina, limit: LIMITE_PAGINA }
	];

	let ultimoErroPagina: any = null;

	for (let i = 0; i < tentativas.length; i++) {
		try {
			return await (joplin.data as any).get(['notes'], tentativas[i]);
		} catch (e) {
			ultimoErroPagina = e;
		}
	}

	throw ultimoErroPagina;
}

async function obterListaNotas(): Promise<any[]> {
	const todas: any[] = [];
	let pagina = 1;

	while (pagina <= MAX_PAGINAS) {
		let res: any;

		try {
			res = await buscarPagina(pagina);
		} catch (e) {
			registrarErro('erro ao listar notas pagina ' + String(pagina), e);
			break;
		}

		const itens = extrairLista(res);

		for (let i = 0; i < itens.length; i++) {
			todas.push(itens[i]);
		}

		const temMais = !!(res && res.has_more === true);

		if (!temMais || itens.length === 0) {
			break;
		}

		pagina++;
	}

	return todas;
}

function notaRecente(nota: any): boolean {
	const agora = Date.now();
	const atualizado = Number(nota.updated_time);

	if (!atualizado || isNaN(atualizado)) {
		return false;
	}

	return (agora - atualizado) < PROTECAO_EDICAO_MS;
}

async function processarTudo(): Promise<void> {
	if (processando) return;

	processando = true;

	try {
		ticks += 1;

		const notas = await obterListaNotas();

		if (ticks === 1 || (ticks % 30) === 0) {
			escreverLog('polling ativo', notas.length);
		}

		let reescritas = 0;

		for (let i = 0; i < notas.length; i++) {
			const nota = notas[i];

			if (!nota || !nota.id || typeof nota.body !== 'string') {
				continue;
			}

			if (notaRecente(nota)) {
				continue;
			}

			const novo = processarNota(nota.body);

			if (novo !== nota.body) {
				try {
					await (joplin.data as any).put(['notes', String(nota.id)], null, { body: novo });
					escreverLog('nota atualizada', String(nota.id));
					reescritas += 1;

					if (MAX_REESCRITAS_POR_CICLO > 0 && reescritas >= MAX_REESCRITAS_POR_CICLO) {
						break;
					}
				} catch (e) {
					registrarErro('erro ao salvar nota', e);
					break;
				}
			}
		}
	} catch (e) {
		registrarErro('erro no polling', e);
	} finally {
		processando = false;
	}
}

const registro: RegistroCompat = {
	onStart: async function (): Promise<void> {
		escreverLog('LOADED v15 paginado tipado');

		try {
			await processarTudo();

			intervalo = setInterval(async () => {
				await processarTudo();
			}, INTERVALO_MS);

			escreverLog('polling global iniciado');
		} catch (e) {
			registrarErro('erro ao iniciar polling', e);
		}
	},
	onStop: function (): void {
		if (intervalo !== null) {
			clearInterval(intervalo);
			intervalo = null;
		}

		escreverLog('STOP intervalo limpo');
	}
};

joplin.plugins.register(registro);